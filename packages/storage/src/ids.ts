import { randomBytes as nodeRandomBytes } from "node:crypto";

import type { Ulid } from "@pm/contracts";

/**
 * DB-005 ULID generation.
 *
 * IDs are created by the application rather than by SQLite, so the same
 * factory has to be usable from a service and from a test that wants a
 * deterministic sequence. Two properties matter beyond "26 characters":
 * lexicographic order follows creation order (the cursor sorts by id), and
 * several IDs created inside the same millisecond still increase.
 */

const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ULID_LENGTH = 26;
const TIME_CHARACTERS = 10;
const RANDOM_BYTES = 10;

const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export interface UlidFactoryOptions {
  /** Milliseconds since the epoch. Injectable so ordering tests are stable. */
  now?: () => number;
  /** 10 random bytes. Injectable so a test can force the monotonic path. */
  randomBytes?: (size: number) => Buffer;
}

function encodeTime(timestamp: number): string {
  let remaining = timestamp;
  let encoded = "";
  for (let index = 0; index < TIME_CHARACTERS; index += 1) {
    encoded = CROCKFORD_ALPHABET[remaining % 32] + encoded;
    remaining = Math.floor(remaining / 32);
  }
  return encoded;
}

/** 10 bytes -> 16 characters, five bits at a time, most significant first. */
function encodeRandom(bytes: Buffer): string {
  let encoded = "";
  for (let group = 0; group < ULID_LENGTH - TIME_CHARACTERS; group += 1) {
    let value = 0;
    for (let bit = 0; bit < 5; bit += 1) {
      const bitIndex = group * 5 + bit;
      const byteIndex = bitIndex >> 3;
      const bitInByte = 7 - (bitIndex & 7);
      value = (value << 1) | ((bytes[byteIndex] >> bitInByte) & 1);
    }
    encoded += CROCKFORD_ALPHABET[value];
  }
  return encoded;
}

/** Adds one to an 80-bit big-endian counter. Returns null on overflow. */
function incrementRandom(bytes: Buffer): Buffer | null {
  const next = Buffer.from(bytes);
  for (let index = next.length - 1; index >= 0; index -= 1) {
    if (next[index] === 0xff) {
      next[index] = 0x00;
      continue;
    }
    next[index] += 1;
    return next;
  }
  return null;
}

export class UlidFactory {
  private lastTimestamp = -1;
  // Annotated rather than inferred: `Buffer.alloc` narrows to
  // `Buffer<ArrayBuffer>` while the increment returns the wider `Buffer`.
  private lastRandom: Buffer = Buffer.alloc(RANDOM_BYTES);

  constructor(private readonly options: UlidFactoryOptions = {}) {}

  create(): Ulid {
    const requested = this.options.now ? this.options.now() : Date.now();

    // A clock that jumps backwards would otherwise emit a smaller ULID and
    // break the cursor order, so the timestamp is clamped to the last one.
    let timestamp = requested < this.lastTimestamp ? this.lastTimestamp : requested;

    let random: Buffer;
    if (timestamp === this.lastTimestamp) {
      const incremented = incrementRandom(this.lastRandom);
      if (incremented) {
        random = incremented;
      } else {
        // The 80-bit space is exhausted inside this millisecond; borrow the
        // next one instead of emitting a duplicate or a smaller value.
        timestamp += 1;
        random = Buffer.alloc(RANDOM_BYTES);
      }
    } else {
      random = (this.options.randomBytes ?? nodeRandomBytes)(RANDOM_BYTES);
    }

    this.lastTimestamp = timestamp;
    this.lastRandom = random;
    return (encodeTime(timestamp) + encodeRandom(random)) as Ulid;
  }
}

const defaultFactory = new UlidFactory();

export function createUlid(): Ulid {
  return defaultFactory.create();
}

export function isUlid(value: unknown): value is Ulid {
  return typeof value === "string" && ULID_PATTERN.test(value);
}

/** Milliseconds encoded in the ULID; throws when the value is not a ULID. */
export function ulidTimestamp(value: Ulid): number {
  if (!isUlid(value)) {
    throw new RangeError(`not a ULID: ${String(value)}`);
  }
  let timestamp = 0;
  for (const character of value.slice(0, TIME_CHARACTERS)) {
    timestamp = timestamp * 32 + CROCKFORD_ALPHABET.indexOf(character);
  }
  return timestamp;
}
