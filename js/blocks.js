// Bunyan block + item registry. Pure data: imported by the main thread and by the worker.

export const CHUNK = 16;
export const HEIGHT = 128;
export const SEA = 46;

// Texture tiles in the 16x16 atlas, in index order. textures.js paints each one by name.
export const TILES = [
  'stone', 'dirt', 'grass_top', 'grass_side', 'cobble', 'planks', 'bedrock', 'sand',
  'gravel', 'log_side', 'log_top', 'leaves', 'glass', 'water', 'coal_ore', 'iron_ore',
  'gold_ore', 'diamond_ore', 'table_top', 'table_side', 'table_front', 'furnace_front', 'furnace_side', 'furnace_top',
  'furnace_lit', 'torch', 'bricks', 'snow', 'snow_side', 'ice', 'cactus_side', 'cactus_top',
  'birch_side', 'birch_top', 'birch_leaves', 'spruce_side', 'spruce_top', 'spruce_leaves', 'birch_planks', 'spruce_planks',
  'tall_grass', 'flower_red', 'flower_yellow', 'dead_bush', 'sandstone_side', 'sandstone_top', 'stone_bricks', 'bookshelf',
  'chest_front', 'chest_side', 'chest_top', 'bed_top', 'bed_side', 'wool', 'wool_red', 'wool_blue',
  'wool_green', 'wool_yellow', 'wool_black', 'lava', 'obsidian', 'clay', 'lamp', 'farmland',
  'wheat0', 'wheat1', 'wheat2', 'wheat3', 'sapling', 'mossy', 'gold_block', 'iron_block',
  'diamond_block', 'coal_block', 'mud_brick', 'flower_blue', 'terracotta', 'sign', 'crack0', 'crack1',
  'crack2', 'crack3', 'crack4', 'crack5', 'crack6', 'crack7', 'crack8', 'crack9', 'water_flow',
];
export const TILE = Object.fromEntries(TILES.map((n, i) => [n, i]));

export const B = {
  AIR: 0, STONE: 1, GRASS: 2, DIRT: 3, COBBLE: 4, PLANKS: 5, BEDROCK: 6, SAND: 7, GRAVEL: 8, LOG: 9,
  LEAVES: 10, GLASS: 11, WATER: 12, // 13..19 flowing water, level 1..7
  COAL_ORE: 20, IRON_ORE: 21, GOLD_ORE: 22, DIAMOND_ORE: 23, TABLE: 24, FURNACE: 25, FURNACE_LIT: 26,
  TORCH: 27, BRICKS: 28, SNOW: 29, SNOW_GRASS: 30, ICE: 31, CACTUS: 32, BIRCH_LOG: 33, BIRCH_LEAVES: 34,
  SPRUCE_LOG: 35, SPRUCE_LEAVES: 36, BIRCH_PLANKS: 37, SPRUCE_PLANKS: 38, TALL_GRASS: 39, FLOWER_RED: 40,
  FLOWER_YELLOW: 41, DEAD_BUSH: 42, SANDSTONE: 43, STONE_BRICKS: 44, BOOKSHELF: 45, CHEST: 46, BED: 47,
  WOOL: 48, WOOL_RED: 49, WOOL_BLUE: 50, WOOL_GREEN: 51, WOOL_YELLOW: 52, WOOL_BLACK: 53, LAVA: 54,
  OBSIDIAN: 55, CLAY: 56, LAMP: 57, FARMLAND: 58, WHEAT0: 59, WHEAT1: 60, WHEAT2: 61, WHEAT3: 62,
  SAPLING: 63, MOSSY: 64, GOLD_BLOCK: 65, IRON_BLOCK: 66, DIAMOND_BLOCK: 67, COAL_BLOCK: 68, MUD_BRICK: 69,
  FLOWER_BLUE: 70, TERRACOTTA: 71, SIGN: 72,
};

export const I = {
  STICK: 256, COAL: 257, CHARCOAL: 258, IRON: 259, GOLD: 260, DIAMOND: 261,
  WOOD_PICK: 262, WOOD_AXE: 263, WOOD_SHOVEL: 264, WOOD_SWORD: 265,
  STONE_PICK: 266, STONE_AXE: 267, STONE_SHOVEL: 268, STONE_SWORD: 269,
  IRON_PICK: 270, IRON_AXE: 271, IRON_SHOVEL: 272, IRON_SWORD: 273,
  DIAMOND_PICK: 274, DIAMOND_AXE: 275, DIAMOND_SHOVEL: 276, DIAMOND_SWORD: 277,
  APPLE: 278, BREAD: 279, RAW_MUTTON: 280, COOKED_MUTTON: 281, RAW_BEEF: 282, STEAK: 283,
  RAW_CHICKEN: 284, COOKED_CHICKEN: 285, ROTTEN_FLESH: 286, BONE: 287, STRING: 288, ARROW: 289,
  FEATHER: 290, LEATHER: 291, SEEDS: 292, WHEAT: 293, WOOD_HOE: 294, STONE_HOE: 295, IRON_HOE: 296,
  BUCKET: 297, WATER_BUCKET: 298, LAVA_BUCKET: 299, BOW: 300, FLINT: 301, CLAY_BALL: 302, BRICK: 303,
  DATES: 304,
  LEATHER_HELMET: 305, LEATHER_CHEST: 306, LEATHER_LEGS: 307, LEATHER_BOOTS: 308,
  IRON_HELMET: 309, IRON_CHEST: 310, IRON_LEGS: 311, IRON_BOOTS: 312,
  DIAMOND_HELMET: 313, DIAMOND_CHEST: 314, DIAMOND_LEGS: 315, DIAMOND_BOOTS: 316,
};

const blocks = [];
function def(id, o) {
  blocks[id] = Object.assign({
    id, name: '', tex: null, shape: 'cube', solid: true, opaque: true, cutout: false,
    light: 0, hardness: 1, tool: null, tier: 0, drop: id, cat: 'build', stack: 64, sound: 'stone',
    liquid: false, cullSame: false, replaceable: false, attenuate: 0, hidden: false,
  }, o);
}
const t = n => TILE[n];
const all = n => ({ top: t(n), bottom: t(n), side: t(n) });
const tbs = (top, bottom, side) => ({ top: t(top), bottom: t(bottom), side: t(side) });

def(B.AIR, { name: 'هواء', shape: 'none', solid: false, opaque: false, hardness: 0, drop: 0, hidden: true, replaceable: true });
def(B.STONE, { name: 'حجر', tex: all('stone'), hardness: 1.5, tool: 'pickaxe', tier: 1, drop: B.COBBLE });
def(B.GRASS, { name: 'عشب', tex: tbs('grass_top', 'dirt', 'grass_side'), hardness: 0.6, tool: 'shovel', drop: B.DIRT, cat: 'nature', sound: 'grass' });
def(B.DIRT, { name: 'تراب', tex: all('dirt'), hardness: 0.5, tool: 'shovel', cat: 'nature', sound: 'dirt' });
def(B.COBBLE, { name: 'حجر مكسّر', tex: all('cobble'), hardness: 2, tool: 'pickaxe', tier: 1 });
def(B.PLANKS, { name: 'ألواح خشب', tex: all('planks'), hardness: 2, tool: 'axe', sound: 'wood' });
def(B.BEDROCK, { name: 'صخر الأساس', tex: all('bedrock'), hardness: -1, drop: 0 });
def(B.SAND, { name: 'رمل', tex: all('sand'), hardness: 0.5, tool: 'shovel', cat: 'nature', sound: 'sand', gravity: true });
def(B.GRAVEL, { name: 'حصى', tex: all('gravel'), hardness: 0.6, tool: 'shovel', cat: 'nature', sound: 'dirt', gravity: true });
def(B.LOG, { name: 'جذع بلوط', tex: tbs('log_top', 'log_top', 'log_side'), hardness: 2, tool: 'axe', cat: 'nature', sound: 'wood' });
def(B.LEAVES, { name: 'أوراق بلوط', tex: all('leaves'), hardness: 0.2, opaque: false, cutout: true, drop: 0, cat: 'nature', sound: 'grass', attenuate: 1, leaves: true });
def(B.GLASS, { name: 'زجاج', tex: all('glass'), hardness: 0.3, opaque: false, cutout: true, cullSame: true, drop: 0, sound: 'glass' });
def(B.WATER, { name: 'ماء', tex: all('water'), shape: 'water', solid: false, opaque: false, liquid: true, hardness: -1, drop: 0, cullSame: true, cat: 'nature', replaceable: true, attenuate: 2, hidden: true });
for (let l = 1; l <= 7; l++) def(B.WATER + l, { name: 'ماء جارٍ', tex: all('water_flow'), shape: 'water', solid: false, opaque: false, liquid: true, level: l, hardness: -1, drop: 0, cullSame: true, replaceable: true, attenuate: 2, hidden: true });
blocks[B.WATER].level = 0;
def(B.COAL_ORE, { name: 'خام فحم', tex: all('coal_ore'), hardness: 3, tool: 'pickaxe', tier: 1, drop: I.COAL, cat: 'nature' });
def(B.IRON_ORE, { name: 'خام حديد', tex: all('iron_ore'), hardness: 3, tool: 'pickaxe', tier: 2, cat: 'nature' });
def(B.GOLD_ORE, { name: 'خام ذهب', tex: all('gold_ore'), hardness: 3, tool: 'pickaxe', tier: 3, cat: 'nature' });
def(B.DIAMOND_ORE, { name: 'خام ألماس', tex: all('diamond_ore'), hardness: 3, tool: 'pickaxe', tier: 3, drop: I.DIAMOND, cat: 'nature' });
def(B.TABLE, { name: 'طاولة صناعة', tex: { top: t('table_top'), bottom: t('planks'), side: t('table_side'), front: t('table_front') }, hardness: 2.5, tool: 'axe', sound: 'wood', use: 'table', cat: 'misc' });
def(B.FURNACE, { name: 'فرن', tex: { top: t('furnace_top'), bottom: t('furnace_top'), side: t('furnace_side'), front: t('furnace_front') }, hardness: 3.5, tool: 'pickaxe', tier: 1, use: 'furnace', cat: 'misc' });
def(B.FURNACE_LIT, { name: 'فرن مشتعل', tex: { top: t('furnace_top'), bottom: t('furnace_top'), side: t('furnace_side'), front: t('furnace_lit') }, hardness: 3.5, tool: 'pickaxe', tier: 1, drop: B.FURNACE, light: 13, use: 'furnace', hidden: true });
def(B.TORCH, { name: 'شعلة', tex: all('torch'), shape: 'torch', solid: false, opaque: false, cutout: true, light: 14, hardness: 0, sound: 'wood', cat: 'misc' });
def(B.BRICKS, { name: 'طوب أحمر', tex: all('bricks'), hardness: 2, tool: 'pickaxe', tier: 1 });
def(B.SNOW, { name: 'ثلج', tex: all('snow'), hardness: 0.2, tool: 'shovel', cat: 'nature', sound: 'snow' });
def(B.SNOW_GRASS, { name: 'عشب مثلّج', tex: tbs('snow', 'dirt', 'snow_side'), hardness: 0.6, tool: 'shovel', drop: B.DIRT, cat: 'nature', sound: 'snow' });
def(B.ICE, { name: 'جليد', tex: all('ice'), hardness: 0.5, tool: 'pickaxe', opaque: false, cutout: false, cullSame: true, drop: 0, cat: 'nature', sound: 'glass', attenuate: 1, translucent: true });
def(B.CACTUS, { name: 'صبّار', tex: tbs('cactus_top', 'cactus_top', 'cactus_side'), shape: 'cactus', opaque: false, cutout: true, hardness: 0.4, cat: 'nature', sound: 'grass', hurts: 1 });
def(B.BIRCH_LOG, { name: 'جذع بتولا', tex: tbs('birch_top', 'birch_top', 'birch_side'), hardness: 2, tool: 'axe', cat: 'nature', sound: 'wood' });
def(B.BIRCH_LEAVES, { name: 'أوراق بتولا', tex: all('birch_leaves'), hardness: 0.2, opaque: false, cutout: true, drop: 0, cat: 'nature', sound: 'grass', attenuate: 1, leaves: true });
def(B.SPRUCE_LOG, { name: 'جذع تنّوب', tex: tbs('spruce_top', 'spruce_top', 'spruce_side'), hardness: 2, tool: 'axe', cat: 'nature', sound: 'wood' });
def(B.SPRUCE_LEAVES, { name: 'أوراق تنّوب', tex: all('spruce_leaves'), hardness: 0.2, opaque: false, cutout: true, drop: 0, cat: 'nature', sound: 'grass', attenuate: 1, leaves: true });
def(B.BIRCH_PLANKS, { name: 'ألواح بتولا', tex: all('birch_planks'), hardness: 2, tool: 'axe', sound: 'wood' });
def(B.SPRUCE_PLANKS, { name: 'ألواح تنّوب', tex: all('spruce_planks'), hardness: 2, tool: 'axe', sound: 'wood' });
const plant = (name, tex, extra) => Object.assign({ name, tex: all(tex), shape: 'cross', solid: false, opaque: false, cutout: true, hardness: 0, cat: 'nature', sound: 'grass', replaceable: false, needsSoil: true }, extra);
def(B.TALL_GRASS, plant('عشب طويل', 'tall_grass', { drop: 0, replaceable: true }));
def(B.FLOWER_RED, plant('شقائق النعمان', 'flower_red'));
def(B.FLOWER_YELLOW, plant('زهرة صفراء', 'flower_yellow'));
def(B.FLOWER_BLUE, plant('زهرة زرقاء', 'flower_blue'));
def(B.DEAD_BUSH, plant('شجيرة يابسة', 'dead_bush', { drop: I.STICK, replaceable: true }));
def(B.SANDSTONE, { name: 'حجر رملي', tex: tbs('sandstone_top', 'sandstone_top', 'sandstone_side'), hardness: 0.8, tool: 'pickaxe', tier: 1 });
def(B.STONE_BRICKS, { name: 'طوب حجري', tex: all('stone_bricks'), hardness: 1.5, tool: 'pickaxe', tier: 1 });
def(B.BOOKSHELF, { name: 'رفّ كتب', tex: tbs('planks', 'planks', 'bookshelf'), hardness: 1.5, tool: 'axe', sound: 'wood' });
def(B.CHEST, { name: 'صندوق', tex: { top: t('chest_top'), bottom: t('chest_top'), side: t('chest_side'), front: t('chest_front') }, hardness: 2.5, tool: 'axe', sound: 'wood', use: 'chest', cat: 'misc' });
def(B.BED, { name: 'سرير', tex: tbs('bed_top', 'planks', 'bed_side'), shape: 'bed', opaque: false, hardness: 0.2, sound: 'wool', use: 'bed', stack: 1, cat: 'misc' });
def(B.WOOL, { name: 'صوف أبيض', tex: all('wool'), hardness: 0.8, sound: 'wool' });
def(B.WOOL_RED, { name: 'صوف أحمر', tex: all('wool_red'), hardness: 0.8, sound: 'wool' });
def(B.WOOL_BLUE, { name: 'صوف أزرق', tex: all('wool_blue'), hardness: 0.8, sound: 'wool' });
def(B.WOOL_GREEN, { name: 'صوف أخضر', tex: all('wool_green'), hardness: 0.8, sound: 'wool' });
def(B.WOOL_YELLOW, { name: 'صوف أصفر', tex: all('wool_yellow'), hardness: 0.8, sound: 'wool' });
def(B.WOOL_BLACK, { name: 'صوف أسود', tex: all('wool_black'), hardness: 0.8, sound: 'wool' });
def(B.LAVA, { name: 'حمم', tex: all('lava'), shape: 'water', solid: false, opaque: false, liquid: true, lava: true, light: 15, hardness: -1, drop: 0, cullSame: true, cat: 'nature', replaceable: true, hidden: true, level: 0 });
def(B.OBSIDIAN, { name: 'سَبَج', tex: all('obsidian'), hardness: 50, tool: 'pickaxe', tier: 4, cat: 'nature' });
def(B.CLAY, { name: 'طين', tex: all('clay'), hardness: 0.6, tool: 'shovel', drop: I.CLAY_BALL, dropCount: 4, cat: 'nature', sound: 'dirt' });
def(B.LAMP, { name: 'مصباح', tex: all('lamp'), hardness: 0.3, light: 15, sound: 'glass', cat: 'misc' });
def(B.FARMLAND, { name: 'أرض محروثة', tex: tbs('farmland', 'dirt', 'dirt'), hardness: 0.6, tool: 'shovel', drop: B.DIRT, cat: 'nature', sound: 'dirt', hidden: true });
for (let s = 0; s < 4; s++) def(B.WHEAT0 + s, plant('قمح', 'wheat' + s, { shape: 'crop', drop: s === 3 ? I.WHEAT : I.SEEDS, hidden: true, stage: s, needsSoil: false }));
def(B.SAPLING, plant('شتلة بلوط', 'sapling'));
def(B.MOSSY, { name: 'حجر مطحلب', tex: all('mossy'), hardness: 2, tool: 'pickaxe', tier: 1 });
def(B.GOLD_BLOCK, { name: 'كتلة ذهب', tex: all('gold_block'), hardness: 3, tool: 'pickaxe', tier: 3, sound: 'metal' });
def(B.IRON_BLOCK, { name: 'كتلة حديد', tex: all('iron_block'), hardness: 5, tool: 'pickaxe', tier: 2, sound: 'metal' });
def(B.DIAMOND_BLOCK, { name: 'كتلة ألماس', tex: all('diamond_block'), hardness: 5, tool: 'pickaxe', tier: 3, sound: 'metal' });
def(B.COAL_BLOCK, { name: 'كتلة فحم', tex: all('coal_block'), hardness: 5, tool: 'pickaxe', tier: 1 });
def(B.MUD_BRICK, { name: 'طوب لِبن', tex: all('mud_brick'), hardness: 1.5, tool: 'pickaxe' });
def(B.TERRACOTTA, { name: 'فخّار', tex: all('terracotta'), hardness: 1.25, tool: 'pickaxe', tier: 1 });
def(B.SIGN, { name: 'لافتة', tex: all('sign'), shape: 'sign', solid: false, opaque: false, hardness: 1, tool: 'axe', sound: 'wood', use: 'sign', stack: 16, cat: 'misc' });

export const BLOCKS = blocks;
for (let i = 0; i < 256; i++) if (!blocks[i]) def(i, { name: '?', shape: 'none', solid: false, opaque: false, hidden: true, drop: 0 });

export const isWater = id => id >= B.WATER && id <= B.WATER + 7;
export const isLiquid = id => isWater(id) || id === B.LAVA;

// ---------- items ----------
const items = {};
function item(id, o) { items[id] = Object.assign({ id, name: '', stack: 64, cat: 'misc' }, o); }
item(I.STICK, { name: 'عصا', fuel: 5 });
item(I.COAL, { name: 'فحم', fuel: 80 });
item(I.CHARCOAL, { name: 'فحم نباتي', fuel: 80 });
item(I.IRON, { name: 'سبيكة حديد' });
item(I.GOLD, { name: 'سبيكة ذهب' });
item(I.DIAMOND, { name: 'ألماس' });
const TIERS = [
  ['WOOD', 'خشبي', 1, 2, 60], ['STONE', 'حجري', 2, 4, 132], ['IRON', 'حديدي', 3, 6, 251], ['DIAMOND', 'ألماسي', 4, 8, 1562],
];
for (const [k, n, tier, speed, dur] of TIERS) {
  item(I[k + '_PICK'], { name: 'فأس تعدين ' + n, stack: 1, cat: 'tools', tool: { type: 'pickaxe', tier, speed, damage: 1 + tier, durability: dur }, fuel: k === 'WOOD' ? 10 : 0 });
  item(I[k + '_AXE'], { name: 'بلطة ' + n, stack: 1, cat: 'tools', tool: { type: 'axe', tier, speed, damage: 2 + tier, durability: dur }, fuel: k === 'WOOD' ? 10 : 0 });
  item(I[k + '_SHOVEL'], { name: 'مجرفة ' + n, stack: 1, cat: 'tools', tool: { type: 'shovel', tier, speed, damage: tier, durability: dur }, fuel: k === 'WOOD' ? 10 : 0 });
  item(I[k + '_SWORD'], { name: 'سيف ' + n, stack: 1, cat: 'tools', tool: { type: 'sword', tier, speed: 1.5, damage: 3 + tier, durability: dur }, fuel: k === 'WOOD' ? 10 : 0 });
}
item(I.WOOD_HOE, { name: 'معزقة خشبية', stack: 1, cat: 'tools', tool: { type: 'hoe', tier: 1, speed: 1, damage: 1, durability: 60 }, fuel: 10 });
item(I.STONE_HOE, { name: 'معزقة حجرية', stack: 1, cat: 'tools', tool: { type: 'hoe', tier: 2, speed: 1, damage: 1, durability: 132 } });
item(I.IRON_HOE, { name: 'معزقة حديدية', stack: 1, cat: 'tools', tool: { type: 'hoe', tier: 3, speed: 1, damage: 1, durability: 251 } });
item(I.APPLE, { name: 'تفاحة', cat: 'food', food: 4 });
item(I.DATES, { name: 'تمر', cat: 'food', food: 3 });
item(I.BREAD, { name: 'عيش', cat: 'food', food: 5 });
item(I.RAW_MUTTON, { name: 'لحم ضاني نيّء', cat: 'food', food: 2, smelt: I.COOKED_MUTTON });
item(I.COOKED_MUTTON, { name: 'لحم ضاني مشوي', cat: 'food', food: 6 });
item(I.RAW_BEEF, { name: 'لحم بقري نيّء', cat: 'food', food: 3, smelt: I.STEAK });
item(I.STEAK, { name: 'ستيك مشوي', cat: 'food', food: 8 });
item(I.RAW_CHICKEN, { name: 'فراخ نيّئة', cat: 'food', food: 2, smelt: I.COOKED_CHICKEN });
item(I.COOKED_CHICKEN, { name: 'فراخ مشوية', cat: 'food', food: 6 });
item(I.ROTTEN_FLESH, { name: 'لحم فاسد', cat: 'food', food: 2 });
item(I.BONE, { name: 'عظمة' });
item(I.STRING, { name: 'خيط' });
item(I.ARROW, { name: 'سهم', cat: 'tools' });
item(I.FEATHER, { name: 'ريشة' });
item(I.LEATHER, { name: 'جلد' });
item(I.SEEDS, { name: 'بذور قمح', cat: 'nature', place: B.WHEAT0 });
item(I.WHEAT, { name: 'قمح' });
item(I.BUCKET, { name: 'جردل', stack: 16, cat: 'tools' });
item(I.WATER_BUCKET, { name: 'جردل ماء', stack: 1, cat: 'tools' });
item(I.LAVA_BUCKET, { name: 'جردل حمم', stack: 1, cat: 'tools', fuel: 1000 });
item(I.BOW, { name: 'قوس', stack: 1, cat: 'tools', tool: { type: 'bow', tier: 1, speed: 1, damage: 1, durability: 384 } });
item(I.FLINT, { name: 'صوّان' });
item(I.CLAY_BALL, { name: 'كرة طين', smelt: I.BRICK });
item(I.BRICK, { name: 'طوبة' });
// armour: slot 0 head, 1 chest, 2 legs, 3 feet
const ARMOR = [['LEATHER', 'جلد', [1, 3, 2, 1], 70], ['IRON', 'حديد', [2, 6, 5, 2], 200], ['DIAMOND', 'ألماس', [3, 8, 6, 3], 450]];
const PIECES = [['HELMET', 'خوذة'], ['CHEST', 'درع صدر'], ['LEGS', 'بنطلون'], ['BOOTS', 'جزمة']];
for (const [m, mn, defs, dur] of ARMOR) PIECES.forEach(([p, pn], slot) => item(I[m + '_' + p], { name: `${pn} ${mn}`, stack: 1, cat: 'tools', armor: { slot, def: defs[slot], durability: dur } }));
export const ITEMS = items;
export const armorOf = id => (items[id] && items[id].armor) || null;

export function isBlockId(id) { return id > 0 && id < 256; }
export function info(id) { return id < 256 ? BLOCKS[id] : ITEMS[id]; }
export function nameOf(id) { const x = info(id); return x ? x.name : ''; }
export function maxStack(id) { const x = info(id); return x ? x.stack : 64; }
export function toolOf(id) { const x = ITEMS[id]; return x && x.tool ? x.tool : null; }

// fuel (seconds of burn)
const BLOCK_FUEL = { [B.LOG]: 15, [B.BIRCH_LOG]: 15, [B.SPRUCE_LOG]: 15, [B.PLANKS]: 15, [B.BIRCH_PLANKS]: 15, [B.SPRUCE_PLANKS]: 15, [B.TABLE]: 15, [B.CHEST]: 15, [B.BOOKSHELF]: 15, [B.SAPLING]: 5, [B.COAL_BLOCK]: 800 };
export function fuelOf(id) { if (id < 256) return BLOCK_FUEL[id] || 0; return (ITEMS[id] && ITEMS[id].fuel) || 0; }

// smelting
const BLOCK_SMELT = { [B.COBBLE]: B.STONE, [B.SAND]: B.GLASS, [B.IRON_ORE]: I.IRON, [B.GOLD_ORE]: I.GOLD, [B.LOG]: I.CHARCOAL, [B.BIRCH_LOG]: I.CHARCOAL, [B.SPRUCE_LOG]: I.CHARCOAL, [B.CLAY]: B.TERRACOTTA, [B.CACTUS]: B.WOOL_GREEN };
export function smeltOf(id) { if (id < 256) return BLOCK_SMELT[id] || 0; return (ITEMS[id] && ITEMS[id].smelt) || 0; }

// break time in seconds for a block with a held item
export function breakTime(blockId, heldId, creative) {
  const b = BLOCKS[blockId];
  if (!b || b.hardness < 0) return Infinity;
  if (creative) return 0;
  if (b.hardness === 0) return 0.05;
  const tool = toolOf(heldId);
  const right = tool && b.tool && tool.type === b.tool;
  const canHarvest = !b.tool || b.tier === 0 || (right && tool.tier >= b.tier);
  let time = b.hardness * (canHarvest ? 1.5 : 5);
  if (right) time /= tool.speed;
  else if (tool && tool.type === 'sword' && b.leaves) time /= 1.5;
  return Math.max(0.05, time);
}
export function canHarvest(blockId, heldId) {
  const b = BLOCKS[blockId];
  if (!b.tool || b.tier === 0) return true;
  const tool = toolOf(heldId);
  return !!(tool && tool.type === b.tool && tool.tier >= b.tier);
}

// ---------- recipes ----------
export const TAGS = {
  planks: [B.PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS],
  log: [B.LOG, B.BIRCH_LOG, B.SPRUCE_LOG],
  coal: [I.COAL, I.CHARCOAL],
  stone: [B.COBBLE],
};
// pattern rows; keys map a char to an id or a '#tag'
function R(out, count, pattern, key, cat) { return { out, count, pattern, key, cat: cat || 'build' }; }
export const RECIPES = [
  R(B.PLANKS, 4, ['L'], { L: B.LOG }),
  R(B.BIRCH_PLANKS, 4, ['L'], { L: B.BIRCH_LOG }),
  R(B.SPRUCE_PLANKS, 4, ['L'], { L: B.SPRUCE_LOG }),
  R(I.STICK, 4, ['P', 'P'], { P: '#planks' }, 'misc'),
  R(B.TABLE, 1, ['PP', 'PP'], { P: '#planks' }, 'misc'),
  R(B.TORCH, 4, ['C', 'S'], { C: '#coal', S: I.STICK }, 'misc'),
  R(B.FURNACE, 1, ['CCC', 'C.C', 'CCC'], { C: B.COBBLE }, 'misc'),
  R(B.CHEST, 1, ['PPP', 'P.P', 'PPP'], { P: '#planks' }, 'misc'),
  R(I.WOOD_PICK, 1, ['PPP', '.S.', '.S.'], { P: '#planks', S: I.STICK }, 'tools'),
  R(I.WOOD_AXE, 1, ['PP', 'PS', '.S'], { P: '#planks', S: I.STICK }, 'tools'),
  R(I.WOOD_SHOVEL, 1, ['P', 'S', 'S'], { P: '#planks', S: I.STICK }, 'tools'),
  R(I.WOOD_SWORD, 1, ['P', 'P', 'S'], { P: '#planks', S: I.STICK }, 'tools'),
  R(I.WOOD_HOE, 1, ['PP', '.S', '.S'], { P: '#planks', S: I.STICK }, 'tools'),
  R(I.STONE_PICK, 1, ['CCC', '.S.', '.S.'], { C: B.COBBLE, S: I.STICK }, 'tools'),
  R(I.STONE_AXE, 1, ['CC', 'CS', '.S'], { C: B.COBBLE, S: I.STICK }, 'tools'),
  R(I.STONE_SHOVEL, 1, ['C', 'S', 'S'], { C: B.COBBLE, S: I.STICK }, 'tools'),
  R(I.STONE_SWORD, 1, ['C', 'C', 'S'], { C: B.COBBLE, S: I.STICK }, 'tools'),
  R(I.STONE_HOE, 1, ['CC', '.S', '.S'], { C: B.COBBLE, S: I.STICK }, 'tools'),
  R(I.IRON_PICK, 1, ['III', '.S.', '.S.'], { I: I.IRON, S: I.STICK }, 'tools'),
  R(I.IRON_AXE, 1, ['II', 'IS', '.S'], { I: I.IRON, S: I.STICK }, 'tools'),
  R(I.IRON_SHOVEL, 1, ['I', 'S', 'S'], { I: I.IRON, S: I.STICK }, 'tools'),
  R(I.IRON_SWORD, 1, ['I', 'I', 'S'], { I: I.IRON, S: I.STICK }, 'tools'),
  R(I.IRON_HOE, 1, ['II', '.S', '.S'], { I: I.IRON, S: I.STICK }, 'tools'),
  R(I.DIAMOND_PICK, 1, ['DDD', '.S.', '.S.'], { D: I.DIAMOND, S: I.STICK }, 'tools'),
  R(I.DIAMOND_AXE, 1, ['DD', 'DS', '.S'], { D: I.DIAMOND, S: I.STICK }, 'tools'),
  R(I.DIAMOND_SHOVEL, 1, ['D', 'S', 'S'], { D: I.DIAMOND, S: I.STICK }, 'tools'),
  R(I.DIAMOND_SWORD, 1, ['D', 'D', 'S'], { D: I.DIAMOND, S: I.STICK }, 'tools'),
  R(I.BOW, 1, ['.SX', 'S.X', '.SX'], { S: I.STICK, X: I.STRING }, 'tools'),
  R(I.ARROW, 4, ['F', 'S', 'E'], { F: I.FLINT, S: I.STICK, E: I.FEATHER }, 'tools'),
  R(I.BUCKET, 1, ['I.I', '.I.'], { I: I.IRON }, 'tools'),
  ...[['LEATHER', I.LEATHER], ['IRON', I.IRON], ['DIAMOND', I.DIAMOND]].flatMap(([m, x]) => [
    R(I[m + '_HELMET'], 1, ['XXX', 'X.X'], { X: x }, 'tools'),
    R(I[m + '_CHEST'], 1, ['X.X', 'XXX', 'XXX'], { X: x }, 'tools'),
    R(I[m + '_LEGS'], 1, ['XXX', 'X.X', 'X.X'], { X: x }, 'tools'),
    R(I[m + '_BOOTS'], 1, ['X.X', 'X.X'], { X: x }, 'tools'),
  ]),
  R(I.BREAD, 1, ['WWW'], { W: I.WHEAT }, 'food'),
  R(B.BED, 1, ['WWW', 'PPP'], { W: B.WOOL, P: '#planks' }, 'misc'),
  R(B.WOOL, 1, ['SS', 'SS'], { S: I.STRING }),
  R(B.WOOL_RED, 1, ['WF'], { W: B.WOOL, F: B.FLOWER_RED }),
  R(B.WOOL_YELLOW, 1, ['WF'], { W: B.WOOL, F: B.FLOWER_YELLOW }),
  R(B.WOOL_BLUE, 1, ['WF'], { W: B.WOOL, F: B.FLOWER_BLUE }),
  R(B.WOOL_BLACK, 1, ['WC'], { W: B.WOOL, C: '#coal' }),
  R(B.STONE_BRICKS, 4, ['SS', 'SS'], { S: B.STONE }),
  R(B.SANDSTONE, 1, ['SS', 'SS'], { S: B.SAND }),
  R(B.BRICKS, 1, ['BB', 'BB'], { B: I.BRICK }),
  R(B.MUD_BRICK, 4, ['DC', 'CD'], { D: B.DIRT, C: I.CLAY_BALL }),
  R(B.MOSSY, 1, ['CL'], { C: B.COBBLE, L: B.LEAVES }),
  R(B.BOOKSHELF, 1, ['PPP', 'SSS', 'PPP'], { P: '#planks', S: I.STICK }),
  R(B.LAMP, 1, ['GGG', 'GTG', 'GGG'], { G: B.GLASS, T: B.TORCH }, 'misc'),
  R(B.SIGN, 3, ['PPP', 'PPP', '.S.'], { P: '#planks', S: I.STICK }, 'misc'),
  R(B.IRON_BLOCK, 1, ['III', 'III', 'III'], { I: I.IRON }),
  R(B.GOLD_BLOCK, 1, ['GGG', 'GGG', 'GGG'], { G: I.GOLD }),
  R(B.DIAMOND_BLOCK, 1, ['DDD', 'DDD', 'DDD'], { D: I.DIAMOND }),
  R(B.COAL_BLOCK, 1, ['CCC', 'CCC', 'CCC'], { C: I.COAL }),
  R(I.IRON, 9, ['B'], { B: B.IRON_BLOCK }, 'misc'),
  R(I.GOLD, 9, ['B'], { B: B.GOLD_BLOCK }, 'misc'),
  R(I.DIAMOND, 9, ['B'], { B: B.DIAMOND_BLOCK }, 'misc'),
  R(I.COAL, 9, ['B'], { B: B.COAL_BLOCK }, 'misc'),
];
for (const r of RECIPES) {
  r.big = r.pattern.length > 2 || r.pattern.some(row => row.length > 2);
  const need = {};
  for (const row of r.pattern) for (const ch of row) if (ch !== '.') { const k = r.key[ch]; need[k] = (need[k] || 0) + 1; }
  r.need = Object.entries(need).map(([k, n]) => ({ key: isNaN(+k) ? k : +k, n }));
}
export function matches(key, id) {
  if (typeof key === 'string' && key[0] === '#') return TAGS[key.slice(1)].includes(id);
  return key === id;
}

// creative palette: what the creative inventory offers, by tab
export function creativeList() {
  const out = { build: [], nature: [], misc: [], tools: [], food: [] };
  for (const b of BLOCKS) if (b && b.id > 0 && !b.hidden) out[b.cat === 'nature' ? 'nature' : b.cat === 'misc' ? 'misc' : 'build'].push(b.id);
  out.nature.push(I.SEEDS);
  for (const id in ITEMS) { const it = ITEMS[id]; if (it.cat === 'tools') out.tools.push(+id); else if (it.cat === 'food') out.food.push(+id); else if (it.cat !== 'nature') out.misc.push(+id); }
  out.nature.push(I.WATER_BUCKET, I.LAVA_BUCKET);
  return out;
}
