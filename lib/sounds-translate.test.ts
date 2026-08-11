import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { searchSoundEventKeys } from "@/lib/SoundsTranslate";

describe("sound event search", () => {
  test("prioritizes an exact translated token over partial matches", () => {
    const results = searchSoundEventKeys([
      "entity.baby_pig.ambient",
      "entity.hoglin.ambient",
      "entity.piglin.ambient",
      "entity.pig.ambient",
      "entity.pig.death",
    ], "猪");

    assert.deepEqual(results.slice(0, 2), [
      "entity.pig.ambient",
      "entity.pig.death",
    ]);
  });

  test("prioritizes an exact event token for English searches", () => {
    const results = searchSoundEventKeys([
      "entity.piglin.ambient",
      "entity.pig.ambient",
    ], "pig");

    assert.equal(results[0], "entity.pig.ambient");
  });
});
