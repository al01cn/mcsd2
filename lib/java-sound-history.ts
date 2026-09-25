export type JavaSoundRename = {
  before: string;
  after: string;
  version: string;
};

type Pair = readonly [before: string, after: string];

function family(before: string, after: string, suffixes: readonly (string | Pair)[]): Pair[] {
  return suffixes.map((suffix) => {
    const [oldSuffix, newSuffix] = typeof suffix === "string" ? [suffix, suffix] : suffix;
    return [`${before}.${oldSuffix}`, `${after}.${newSuffix}`];
  });
}

function at(version: string, pairs: readonly Pair[]): JavaSoundRename[] {
  return pairs.map(([before, after]) => ({ before, after, version }));
}

// Audited naming transitions, not the fallback sounds from protocol translators.
// Source asset hashes and the review procedure are recorded in docs/java-sound-compatibility.md.
export const JAVA_SOUND_RENAMES: readonly JavaSoundRename[] = [
  ...at("1.9", [
    ["ambient.cave.cave", "ambient.cave"],
    ["ambient.weather.rain", "weather.rain"],
    ["ambient.weather.thunder", "entity.lightning.thunder"],
    ["fire.fire", "block.fire.ambient"],
    ["fire.ignite", "item.flintandsteel.use"],
    ["item.fireCharge.use", "item.firecharge.use"],
    ["liquid.lava", "block.lava.ambient"],
    ["liquid.lavapop", "block.lava.pop"],
    ["liquid.water", "block.water.ambient"],
    ["minecart.base", "entity.minecart.riding"],
    ["minecart.inside", "entity.minecart.inside"],
    ...family("portal", "block.portal", [["portal", "ambient"], "travel", "trigger"]),
    ...family("tile.piston", "block.piston", [["in", "contract"], ["out", "extend"]]),
    ...family("fireworks", "entity.firework", [
      "blast", "blast_far", ["largeBlast", "large_blast"],
      ["largeBlast_far", "large_blast_far"], "launch", "twinkle", "twinkle_far",
    ]),
    ...family("note", "block.note", [
      "bass", ["bassattack", "bass"], ["bd", "basedrum"], "harp", "hat", "pling", "snare",
    ]),
    ...family("records", "record", [
      "11", "13", "blocks", "cat", "chirp", "far", "mall", "mellohi", "stal", "strad", "wait", "ward",
    ]),
    ...family("music.game", "music", [
      "creative", "end", ["end.dragon", "dragon"], ["end.credits", "credits"], "nether",
    ]),
    ["random.anvil_break", "block.anvil.destroy"],
    ["random.anvil_land", "block.anvil.land"],
    ["random.anvil_use", "block.anvil.use"],
    ["random.bow", "entity.arrow.shoot"],
    ["random.bowhit", "entity.arrow.hit"],
    ["random.break", "entity.item.break"],
    ["random.burp", "entity.player.burp"],
    ["random.chestclosed", "block.chest.close"],
    ["random.chestopen", "block.chest.open"],
    ["gui.button.press", "ui.button.click"],
    ["random.click", "block.dispenser.dispense"],
    ["random.click", "block.dispenser.fail"],
    ["random.door_close", "block.wooden_door.close"],
    ["random.door_open", "block.wooden_door.open"],
    ["random.drink", "entity.generic.drink"],
    ["random.eat", "entity.generic.eat"],
    ["random.explode", "entity.generic.explode"],
    ["random.fizz", "block.fire.extinguish"],
    ["random.fizz", "block.lava.extinguish"],
    ["random.fizz", "entity.generic.extinguish_fire"],
    ["creeper.primed", "entity.creeper.primed"],
    ["game.tnt.primed", "entity.tnt.primed"],
    ["game.potion.smash", "entity.splash_potion.break"],
    ["random.levelup", "entity.player.levelup"],
    ["random.orb", "entity.experience_orb.pickup"],
    ["random.pop", "entity.item.pickup"],
    ["random.splash", "entity.bobber.splash"],
    ["random.successful_hit", "entity.arrow.hit_player"],
    ["random.wood_click", "block.wood_button.click_on"],
    ["random.wood_click", "block.wood_button.click_off"],
    ...["player", "hostile", "neutral"].flatMap((kind) =>
      family(`game.${kind}`, `entity.${kind === "neutral" ? "generic" : kind}`, [
        ["hurt.fall.big", "big_fall"], ["hurt.fall.small", "small_fall"],
        "hurt", ["die", "death"], "swim", ["swim.splash", "splash"],
      ]),
    ),
    ...["cloth", "grass", "gravel", "sand", "snow", "stone", "wood"].flatMap((material): Pair[] => [
      [`dig.${material}`, `block.${material}.break`],
      [`dig.${material}`, `block.${material}.place`],
      [`step.${material}`, `block.${material}.step`],
      [`step.${material}`, `block.${material}.hit`],
      [`step.${material}`, `block.${material}.fall`],
    ]),
    ["dig.glass", "block.glass.break"],
    ["step.ladder", "block.ladder.step"],
    ...family("mob.bat", "entity.bat", ["death", "hurt", ["idle", "ambient"], "loop", "takeoff"]),
    ...family("mob.blaze", "entity.blaze", [["breathe", "ambient"], "death", ["hit", "hurt"]]),
    ...family("mob.guardian", "entity.guardian", [
      ["hit", "hurt"], ["idle", "ambient"], "death",
      ["land.hit", "hurt_land"], ["land.idle", "ambient_land"], ["land.death", "death_land"],
      "attack", "flop",
    ]),
    ...family("mob.guardian.elder", "entity.elder_guardian", [
      ["hit", "hurt"], ["idle", "ambient"], "death",
    ]),
    ["mob.guardian.curse", "entity.elder_guardian.curse"],
    ...family("mob.cat", "entity.cat", [
      "hiss", ["hitt", "hurt"], ["hitt", "death"], ["meow", "ambient"], "purr", "purreow",
    ]),
    ...family("mob.chicken", "entity.chicken", [
      "hurt", ["hurt", "death"], ["plop", "egg"], ["say", "ambient"], "step",
    ]),
    ...family("mob.cow", "entity.cow", ["hurt", ["hurt", "death"], ["say", "ambient"], "step"]),
    ...family("mob.creeper", "entity.creeper", ["death", ["say", "hurt"]]),
    ...family("mob.enderdragon", "entity.enderdragon", [
      ["end", "death"], "growl", ["growl", "ambient"], ["hit", "hurt"], ["wings", "flap"],
    ]),
    ...family("mob.endermen", "entity.endermen", [
      "death", ["hit", "hurt"], ["idle", "ambient"], ["portal", "teleport"], "scream", "stare",
    ]),
    ...family("mob.ghast", "entity.ghast", [
      ["affectionate_scream", "scream"], ["charge", "warn"], "death",
      ["fireball", "shoot"], ["moan", "ambient"], ["scream", "hurt"],
    ]),
    ...family("mob.horse", "entity.horse", [
      "angry", "armor", "breathe", "death", "gallop", ["hit", "hurt"], ["idle", "ambient"],
      "jump", "land", ["leather", "saddle"], ["soft", "step"], ["wood", "step_wood"],
    ]),
    ...family("mob.horse.donkey", "entity.donkey", [
      "angry", "death", ["hit", "hurt"], ["idle", "ambient"],
    ]),
    ...["skeleton", "zombie"].flatMap((kind) =>
      family(`mob.horse.${kind}`, `entity.${kind}_horse`, ["death", ["hit", "hurt"], ["idle", "ambient"]]),
    ),
    ...family("mob.irongolem", "entity.irongolem", [
      "death", ["hit", "hurt"], ["throw", "attack"], ["walk", "step"],
    ]),
    ...family("mob.magmacube", "entity.magmacube", [["big", "squish"], "jump"]),
    ["mob.magmacube.small", "entity.small_magmacube.squish"],
    ...family("mob.pig", "entity.pig", ["death", ["say", "ambient"], ["say", "hurt"], "step"]),
    ...family("mob.rabbit", "entity.rabbit", ["hurt", ["idle", "ambient"], ["hop", "jump"], "death"]),
    ...family("mob.sheep", "entity.sheep", [
      ["say", "ambient"], ["say", "hurt"], ["say", "death"], "shear", "step",
    ]),
    ...family("mob.silverfish", "entity.silverfish", [
      ["hit", "hurt"], ["kill", "death"], ["say", "ambient"], "step",
    ]),
    ...family("mob.skeleton", "entity.skeleton", ["death", "hurt", ["say", "ambient"], "step"]),
    ...family("mob.slime", "entity.slime", [
      "attack", ["big", "squish"], ["big", "hurt"], ["big", "death"], ["big", "jump"],
    ]),
    ...family("mob.slime", "entity.small_slime", [
      ["small", "squish"], ["small", "hurt"], ["small", "death"], ["small", "jump"],
    ]),
    ...family("mob.spider", "entity.spider", ["death", ["say", "ambient"], ["say", "hurt"], "step"]),
    ...family("mob.villager", "entity.villager", [
      "death", ["haggle", "trading"], ["hit", "hurt"], ["idle", "ambient"], "no", "yes",
    ]),
    ...family("mob.wither", "entity.wither", ["death", "hurt", ["idle", "ambient"], "shoot", "spawn"]),
    ...family("mob.wolf", "entity.wolf", [
      ["bark", "ambient"], "death", "growl", "howl", "hurt", ["panting", "pant"], "shake", "step", "whine",
    ]),
    ...family("mob.zombie", "entity.zombie", [
      "death", "hurt", "infect", ["metal", "attack_iron_door"], ["say", "ambient"],
      "step", ["wood", "attack_door_wood"], ["woodbreak", "break_door_wood"],
    ]),
    ...family("mob.zombie", "entity.zombie_villager", [["remedy", "cure"], ["unfect", "converted"]]),
    ...family("mob.zombiepig", "entity.zombie_pig", [
      ["zpig", "ambient"], ["zpigangry", "angry"], ["zpigdeath", "death"], ["zpighurt", "hurt"],
    ]),
  ]),
  ...at("1.13", [
    ...family("block.cloth", "block.wool", ["break", "fall", "hit", "place", "step"]),
    ...family("block.enderchest", "block.ender_chest", ["close", "open"]),
    ...family("block.metal_pressureplate", "block.metal_pressure_plate", ["click_off", "click_on"]),
    ...family("block.note", "block.note_block", [
      "basedrum", "bass", "bell", "chime", "flute", "guitar", "harp", "hat", "pling", "snare", "xylophone",
    ]),
    ...family("block.slime", "block.slime_block", ["break", "fall", "hit", "place", "step"]),
    ...family("block.stone_pressureplate", "block.stone_pressure_plate", ["click_off", "click_on"]),
    ["block.waterlily.place", "block.lily_pad.place"],
    ...family("block.wood_pressureplate", "block.wooden_pressure_plate", ["click_off", "click_on"]),
    ...family("block.wood_button", "block.wooden_button", ["click_off", "click_on"]),
    ...family("entity.armorstand", "entity.armor_stand", ["break", "fall", "hit", "place"]),
    ...family("entity.bobber", "entity.fishing_bobber", ["retrieve", "splash", "throw"]),
    ...family("entity.enderdragon", "entity.ender_dragon", ["ambient", "death", "flap", "growl", "hurt", "shoot"]),
    ["entity.enderdragon_fireball.explode", "entity.dragon_fireball.explode"],
    ...family("entity.endereye", "entity.ender_eye", ["death", "launch"]),
    ...family("entity.endermen", "entity.enderman", ["ambient", "death", "hurt", "scream", "stare", "teleport"]),
    ["entity.enderpearl.throw", "entity.ender_pearl.throw"],
    ...family("entity.evocation_illager", "entity.evoker", [
      "ambient", "cast_spell", "death", "hurt", "prepare_attack", "prepare_summon", "prepare_wololo",
    ]),
    ...family("entity.firework", "entity.firework_rocket", [
      "blast", "blast_far", "large_blast", "large_blast_far", "launch", "shoot", "twinkle", "twinkle_far",
    ]),
    ...family("entity.illusion_illager", "entity.illusioner", [
      "ambient", "cast_spell", "death", "hurt", "mirror_move", "prepare_blindness", "prepare_mirror",
    ]),
    ...family("entity.irongolem", "entity.iron_golem", ["attack", "death", "hurt", "step"]),
    ...family("entity.itemframe", "entity.item_frame", ["add_item", "break", "place", "remove_item", "rotate_item"]),
    ...family("entity.leashknot", "entity.leash_knot", ["break", "place"]),
    ...family("entity.lightning", "entity.lightning_bolt", ["impact", "thunder"]),
    ["entity.lingeringpotion.throw", "entity.lingering_potion.throw"],
    ...family("entity.magmacube", "entity.magma_cube", ["death", "hurt", "jump", "squish"]),
    ...family("entity.parrot.imitate", "entity.parrot.imitate", [
      ["enderdragon", "ender_dragon"], ["evocation_illager", "evoker"],
      ["illusion_illager", "illusioner"], ["magmacube", "magma_cube"], ["vindication_illager", "vindicator"],
    ]),
    ["entity.polar_bear.baby_ambient", "entity.polar_bear.ambient_baby"],
    ...family("entity.small_magmacube", "entity.magma_cube", [
      ["death", "death_small"], ["hurt", "hurt_small"], ["squish", "squish_small"],
    ]),
    ...family("entity.small_slime", "entity.slime", [
      ["death", "death_small"], ["hurt", "hurt_small"], ["jump", "jump_small"], ["squish", "squish_small"],
    ]),
    ...family("entity.snowman", "entity.snow_golem", ["ambient", "death", "hurt", "shoot"]),
    ["entity.villager.trading", "entity.villager.trade"],
    ...family("entity.vindication_illager", "entity.vindicator", ["ambient", "death", "hurt"]),
    ...family("entity.zombie", "entity.zombie", [
      ["attack_door_wood", "attack_wooden_door"], ["break_door_wood", "break_wooden_door"],
    ]),
    ...family("entity.zombie_pig", "entity.zombie_pigman", ["ambient", "angry", "death", "hurt"]),
    ...family("record", "music_disc", [
      "11", "13", "blocks", "cat", "chirp", "far", "mall", "mellohi", "stal", "strad", "wait", "ward",
    ]),
  ]),
  ...at("1.16", [
    ...family("entity.zombie_pigman", "entity.zombified_piglin", ["ambient", "angry", "death", "hurt"]),
    ["music.nether", "music.nether.nether_wastes"],
  ]),
  ...at("1.17", [
    ["item.sweet_berries.pick_from_bush", "block.sweet_berry_bush.pick_berries"],
  ]),
  ...at("1.20", [
    ["item.brush.brushing", "item.brush.brushing.sand"],
    ["item.brush.brush_sand_completed", "item.brush.brushing.sand.complete"],
  ]),
  ...at("1.20.5", [
    ["entity.generic.wind_burst", "entity.wind_charge.wind_burst"],
  ]),
  ...at("1.21", [
    ["block.trial_spawner.charge_activate", "block.trial_spawner.ominous_activate"],
    ["block.trial_spawner.ambient_charged", "block.trial_spawner.ambient_ominous"],
  ]),
  ...at("1.21.6", [
    ["entity.leash_knot.break", "item.lead.break"],
    ["entity.leash_knot.place", "item.lead.tied"],
  ]),
];
