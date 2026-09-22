import { describe, expect, it } from "vitest";

import { createUlid, isUlid, UlidFactory, ulidTimestamp } from "./ids.js";

const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

describe("ulid factory", () => {
  it("emits 26 Crockford characters excluding I, L, O and U", () => {
    const factory = new UlidFactory();
    for (let index = 0; index < 200; index += 1) {
      const value = factory.create();
      expect(value).toMatch(ULID_PATTERN);
      expect(value).not.toMatch(/[ILOU]/);
    }
    expect(isUlid(createUlid())).toBe(true);
    expect(isUlid("01j8zzzzzzzzzzzzzzzzzzzzzp")).toBe(false);
    expect(isUlid("short")).toBe(false);
  });

  it("encodes the generating millisecond so it can be read back", () => {
    const timestamp = Date.UTC(2026, 8, 22, 1, 2, 3, 456);
    const factory = new UlidFactory({ now: () => timestamp, randomBytes: () => Buffer.alloc(10, 0x2a) });
    expect(ulidTimestamp(factory.create())).toBe(timestamp);
  });

  it("increases lexicographically when the clock advances", () => {
    let clock = 1_700_000_000_000;
    const factory = new UlidFactory({
      now: () => clock,
      randomBytes: (size) => Buffer.alloc(size, 0xff)
    });

    const first = factory.create();
    clock += 1;
    const second = factory.create();
    clock += 1_000;
    const third = factory.create();

    expect(second > first).toBe(true);
    expect(third > second).toBe(true);
  });

  it("still increases when many ids are created inside one millisecond", () => {
    const timestamp = 1_700_000_000_000;
    // The random bytes never change, so ordering can only come from the
    // monotonic increment rather than from luck.
    const factory = new UlidFactory({ now: () => timestamp, randomBytes: (size) => Buffer.alloc(size, 0) });

    const ids = Array.from({ length: 1_000 }, () => factory.create());
    const sorted = [...ids].sort();
    expect(sorted).toEqual(ids);
    expect(new Set(ids).size).toBe(1_000);
    expect(ids.every((value) => ulidTimestamp(value) >= timestamp)).toBe(true);
  });

  it("does not go backwards when the clock jumps back", () => {
    const values = [1_700_000_000_100, 1_700_000_000_050, 1_700_000_000_060];
    let index = 0;
    const factory = new UlidFactory({
      now: () => values[Math.min(index++, values.length - 1)],
      randomBytes: (size) => Buffer.alloc(size, 0x11)
    });

    const ids = [factory.create(), factory.create(), factory.create()];
    expect([...ids].sort()).toEqual(ids);
  });

  it("borrows the next millisecond when the random space overflows", () => {
    const timestamp = 1_700_000_000_000;
    const factory = new UlidFactory({
      now: () => timestamp,
      randomBytes: (size) => Buffer.alloc(size, 0xff)
    });

    const first = factory.create();
    const second = factory.create();

    expect(first).toMatch(ULID_PATTERN);
    expect(second).toMatch(ULID_PATTERN);
    expect(second > first).toBe(true);
    expect(ulidTimestamp(second)).toBe(timestamp + 1);
  });

  it("rejects a value that is not a ULID when reading its timestamp", () => {
    expect(() => ulidTimestamp("nope" as never)).toThrow(RangeError);
  });
});
