import {getOrElse} from 'fp-ts/lib/Either';
import {pipe} from 'fp-ts/lib/function';
import type * as t from 'io-ts';

export const decode = <A, O, I>(codec: t.Type<A, O, I>) => {
  return (value: I): A =>
    pipe(
      value,
      codec.decode,
      getOrElse((): A => {
        throw new TypeError(
          `${JSON.stringify(value)} is not a valid ${codec.name}`,
        );
      }),
    );
};

export const encode = <A, O, I>(codec: t.Type<A, O, I>) => {
  return (value: A): O => codec.encode(value);
};
