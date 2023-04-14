import {Buffer} from 'node:buffer';
import assert from 'node:assert';
import test from 'ava';
import * as io from 'io-ts';
import {pipe} from 'fp-ts/lib/function';
import {decode, encode} from './util.js';

/*
 * # Introduction to io-ts
 *
 * io-ts is a library for runtime type checking of JavaScript values.
 *
 * ## Validate input value
 *
 * Sometimes we have to work with value that we don't know the type of.
 */

const unsafeProcessComplexObject = (object: unknown): number => {
  // We have to check the type of the value before we can use it.
  if (
    typeof object === 'object' &&
    object !== null &&
    'property' in object &&
    typeof object.property === 'number'
  ) {
    return object.property;
  }

  // And throw an error if the type is wrong.
  throw new TypeError('Invalid object');
};

/*
 * It is tedious and error-prone to write such code. Hopefully, TypeScript can
 * help us to constrain the type of the value before we use it.
 */

const typedProcessComplexObject = (object: {value: number}): number =>
  object.value;

/*
 * Exercice 1: Write a function that deserialize a JSON string and return the
 * value if it is a User object.
 */

type User = {name: string; age: number};
const unsafeParseUser = (json: string): User => {
  const object: unknown = JSON.parse(json);
  if (
    typeof object === 'object' &&
    object !== null &&
    'name' in object &&
    typeof object.name === 'string' &&
    'age' in object &&
    typeof object.age === 'number'
  ) {
    const {age, name} = object;
    return {age, name};
  }

  throw new TypeError('Invalid object');
};

test('unsafeParseUser', async (t) => {
  const USER = {name: 'John', age: 42};
  t.deepEqual(unsafeParseUser(JSON.stringify(USER)), USER);

  const INVALID_OBJECTS: unknown[] = [{name: 'John'}, {age: 42}];
  INVALID_OBJECTS.map((object) =>
    t.throws(() => unsafeParseUser(JSON.stringify(object)), {
      instanceOf: TypeError,
    }),
  );
});

/*
 * Io-ts provides a way to define a type and a function to parse a value.
 */
const User = io.type({
  name: io.string,
  age: io.number,
});
const parseUser = (json: string): User => pipe(json, JSON.parse, decode(User));

/*
 * Exercice 2: Write the io-ts type to represent the following type.
 * Refer you to `io-ts` documentation to find the combinator.
 * https://github.com/gcanti/io-ts/blob/master/index.md#implemented-types--combinators
 */

type ComplexObject = {
  falsyValue: null | undefined | false | 0 | '';
  arrayOfTuples?: Array<[number, string]>;
};

// TODO write the io-ts type
const ComplexObject: io.Type<ComplexObject> = io.intersection([
  io.type({
    falsyValue: io.union([
      io.null,
      io.undefined,
      io.literal(false),
      io.literal(0),
      io.literal(''),
    ]),
  }),
  io.partial({
    arrayOfTuples: io.array(io.tuple([io.number, io.string])),
  }),
]);

test('ComplexObject', (t) => {
  const VALID_OBJECTS = [
    {falsyValue: null},
    {falsyValue: undefined},
    {falsyValue: false},
    {falsyValue: 0},
    {falsyValue: ''},
    {falsyValue: null, arrayOfTuples: []},
    {falsyValue: null, arrayOfTuples: [[1, 'a']]},
    {
      falsyValue: null,
      arrayOfTuples: [
        [1, 'a'],
        [2, 'b'],
      ],
    },
  ];
  VALID_OBJECTS.map((object) => {
    t.notThrows(() => {
      decode(ComplexObject)(object);
    });
  });

  const INVALID_OBJECTS = [
    {falsyValue: true},
    {falsyValue: 1},
    {falsyValue: 'foo'},
    {falsyValue: null, arrayOfTuples: [1, 'a']},
  ];
  INVALID_OBJECTS.map((object) => {
    t.throws(() => decode(ComplexObject)(object), {instanceOf: TypeError});
  });
});

/*
 * ## Phantom types and smart constructors
 *
 * But TypeScript types are not enough to handle all contraints about data
 * validation. Take the following example. As you know, we can divide by zero.
 * JavaScript solve the problem by returning `Infinity`.
 * How could we prevent to call the function with a divisor equal to zero ?
 */

const unsafeDivide = (dividend: number, divisor: number): number =>
  dividend / divisor;

/*
 * The technique is to use a phantom type. A phantom type is a type that is not
 * used in the runtime but handle the type constraint and allows function to be
 * type-safe.
 */

// This is a way how we define a phantom type
type NonZeroFinite = number & {readonly NonZeroFinite: symbol};

// To create a value of this type, we have to use a smart constructor
const NonZeroFinite = (n: number): NonZeroFinite => {
  if (Number.isFinite(n) && n !== 0) {
    return n as NonZeroFinite;
  }

  throw new TypeError(`Invalid NonZeroFinite: ${n}`);
};

/*
 * Now we can use the smart constructor to create a value of the phantom type
 * and use it in a type-safe way
 */
const divide = (dividend: number, divisor: NonZeroFinite): number =>
  dividend / divisor;

// @ts-expect-error We have to cast 2 to NonZeroFinite
assert.strictEqual(divide(4, 2), 2);

assert.strictEqual(divide(4, NonZeroFinite(2)), 2);

assert.throws(() => divide(1, NonZeroFinite(0)), TypeError);

/*
 * Io-ts provides us a way to define a phantom type and a smart constructor.
 */

type Positive = io.Branded<number, {readonly Positive: symbol}>;
const Positive = io.brand(io.number, (n): n is Positive => n >= 0, 'Positive');

const sqrt = (n: Positive): number => Math.sqrt(n);

sqrt(decode(Positive)(4));

/*
 * Exercice 3: Write the io-ts type to represent the following type.
 * Refer you to `io-ts` documentation to find the combinator.
 * https://github.com/gcanti/io-ts/blob/master/index.md#implemented-types--combinators
 */

// TODO write the Palindrome branded type
type Palindrome = io.Branded<string, {readonly Palindrome: symbol}>;
const Palindrome = io.brand(
  io.string,
  (s: string): s is Palindrome => [...s].reverse().join('') === s,
  'Palindrome',
);

test('Palindrome', (t) => {
  const VALID_PALINDROMES = ['racecar', 'level', 'noon'];
  VALID_PALINDROMES.map((s) => t.true(Palindrome.is(s)));

  const INVALID_PALINDROMES = ['hello', 'world', 'foo'];
  INVALID_PALINDROMES.map((s) => t.false(Palindrome.is(s)));
});

/*
 * ## Generic types
 *
 * TypeScript allows us to define a type as a parameter of another type. We
 * call it a generic type.
 */

type Either<A, B> = {type: 'left'; value: A} | {type: 'right'; value: B};
const Either = <A, B>(A: io.Type<A>, B: io.Type<B>) =>
  io.union([
    io.type({type: io.literal('left'), value: A}),
    io.type({type: io.literal('right'), value: B}),
  ]);

const NumberOrString = Either(io.number, io.string);

const VALID_NUMBER_OR_STRING = [
  {type: 'left', value: 1},
  {type: 'right', value: 'foo'},
];
VALID_NUMBER_OR_STRING.map((v) => {
  assert.doesNotThrow(() => decode(NumberOrString)(v));
});

const INVALID_NUMBER_OR_STRING = [
  {type: 'right', value: 1},
  {type: 'left', value: 'foo'},
];
INVALID_NUMBER_OR_STRING.map((v) => {
  assert.throws(() => decode(NumberOrString)(v));
});

/*
 * Exercice 4: Write the io-ts type to represent the following type.
 */

type Result<Status, Body> = {status: Status; body: Body};
type CustomResult =
  | Result<200, string>
  | Result<401, 'Unauthorized'>
  | Result<403, 'Forbidden'>
  | Result<404, 'Not found'>
  | Result<500, 'Internal server error'>;

// TODO write the HTTPResult type
const CustomResult: io.Type<CustomResult> = io.never;

test('CustomResult', (t) => {
  const VALID_CUSTOM_RESULTS = [
    {status: 200, body: 'Hello world'},
    {status: 401, body: 'Unauthorized'},
    {status: 403, body: 'Forbidden'},
    {status: 404, body: 'Not found'},
    {status: 500, body: 'Internal server error'},
  ];
  VALID_CUSTOM_RESULTS.map((v) => {
    t.notThrows(() => decode(CustomResult)(v));
  });

  const INVALID_CUSTOM_RESULTS = [
    {status: 200, body: 1},
    {status: 401, body: 'Hello world'},
    {status: 403, body: 1},
    {status: 404, body: 1},
    {status: 500, body: 1},
  ];
  INVALID_CUSTOM_RESULTS.map((v) =>
    t.throws(() => decode(CustomResult)(v), {instanceOf: TypeError}),
  );
});

/*
 * ## Custom types
 *
 * A io-ts `io.Type<A, O, I>` is defined by three types:
 * - `A` that is the type of the decoded value
 * - `O` that is the type of the encoded value
 * - `I` that is the type of the input value
 */

io.string satisfies io.Type<string, string, unknown>;

/*
 * Lets define a custom type that represents a date from a ISO string to a
 * timestamp.
 */

const DateType = new io.Type<Date, string, number>(
  'Date',
  (u): u is Date => u instanceof Date,
  (u, c) => (Number.isFinite(u) ? io.success(new Date(u)) : io.failure(u, c)),
  (a): string => a.toISOString(),
);

const timestampDate = 946_684_800_000;

const date = decode(DateType)(timestampDate);
// > new Date(Date.UTC(2000, 00, 01))

const stringDate = encode(DateType)(date);
// > 2000-01-01T00:00:00.000Z

/*
 * Exercice 5: Write the io-ts type to represent a number that can be decode
 * from a string and encode to a string..
 */

// TODO write the StringToNumber type
const StringToNumber = io.never;

test('StringToNumber', (t) => {
  const VALID_NUMBERS: Array<[string, number, string]> = [
    ['1', 1, '1'],
    ['1.1', 1.1, '1.1'],
    ['1e1', 10, '10'],
  ];
  VALID_NUMBERS.map(([input, value, output]) => {
    t.is(decode(StringToNumber)(input), value);
    t.is(encode(StringToNumber)(value), output);
  });

  const INVALID_NUMBERS = ['foo', 'bar', 'baz'];
  INVALID_NUMBERS.map((input) => {
    t.is(decode(StringToNumber)(input), Number.NaN);
  });
});

/*
 * ## Pipe combinator
 *
 * The pipe combinator allows us to combine multiple io-ts types.
 */

const FromJSON = new io.Type<unknown, string, string>(
  'FromJSON',
  (u): u is unknown => true,
  (u, c) => {
    try {
      return io.success(JSON.parse(u));
    } catch {
      return io.failure(u, c);
    }
  },
  (a): string => JSON.stringify(a),
);

const Product = io.type({
  sku: io.string,
});

const ProductFromJSON = io.string.pipe(FromJSON).pipe(Product);

const phone = decode(ProductFromJSON)('{"sku": "phone"}');
const phoneString = encode(ProductFromJSON)(phone);

/*
 * Exercice 6: Write the io-ts type to represent
 */

// TODO write the ProductFromBase64JSON type
const ProductFromBase64JSON = io.never;

test('ProductFromBase64JSON', (t) => {
  const book = {sku: 'book'};
  const bookBase64 = pipe(book, JSON.stringify, (s) =>
    Buffer.from(s, 'utf8').toString('base64'),
  );
  t.deepEqual(decode(ProductFromBase64JSON)(bookBase64), book);
  t.is(encode(ProductFromBase64JSON)(book), bookBase64);
});
