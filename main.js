#!/usr/bin/env node

/**
 * 易经寻物 Skill - 多算法融合的遗失物品找回工具
 * @version 3.0.0
 * @author roy
 * @last_updated 2026-05-14
 * 遵循 Karpathy 设计规范：简洁、目标驱动、最小化实现
 *
 * 使用方式:
 *   node main.js find --configFile /path/to/config.json
 *   node main.js validate --configFile /path/to/config.json
 *   node main.js explain --resultFile /path/to/result.json
 */

const fs = require('fs');
const path = require('path');
const { Lunar } = require('lunar-javascript');

// ============ 常量定义 ============

/**
 * 八卦二进制映射（3位二进制）
 * 乾=111(7), 兑=110(6), 离=101(5), 震=100(4)
 * 巽=011(3), 坎=010(2), 艮=001(1), 坤=000(0)
 */
const BAGUA_BINARY = {
  0b111: { name: "乾 (Qian)", direction: "西北", element: "金", environment: "高处、金属物旁、圆形物体附近、公共场所" },
  0b110: { name: "兑 (Dui)", direction: "正西", element: "金", environment: "水边、缺口处、垃圾桶旁、废弃物堆" },
  0b101: { name: "离 (Li)", direction: "正南", element: "火", environment: "明亮处、电子产品旁、火炉/厨房、有文书的地方" },
  0b100: { name: "震 (Zhen)", direction: "正东", element: "木", environment: "木制品旁、会发出声音的地方、门窗附近、森林/草地" },
  0b011: { name: "巽 (Xun)", direction: "东南", element: "木", environment: "细长物品旁、通风口、管道、草木茂盛处" },
  0b010: { name: "坎 (Kan)", direction: "正北", element: "水", environment: "阴暗处、水池/洗手间附近、低洼地、车内" },
  0b001: { name: "艮 (Gen)", direction: "东北", element: "土", environment: "角落、柜子/箱子里、高处、石头/墙壁旁" },
  0b000: { name: "坤 (Kun)", direction: "西南", element: "土", environment: "平地、方形物品旁、布料/衣物中、柔软的地方" }
};

/**
 * 1-8 编号到二进制值的映射（兼容现有系统）
 * 乾1=111(7), 兑2=110(6), 离3=101(5), 震4=100(4)
 * 巽5=011(3), 坎6=010(2), 艮7=001(1), 坤8=000(0)
 */
const INDEX_TO_BINARY = [0b000, 0b111, 0b110, 0b101, 0b100, 0b011, 0b010, 0b001];

/**
 * 二进制值到 1-8 编号的映射
 */
const BINARY_TO_INDEX = {
  0b111: 1, 0b110: 2, 0b101: 3, 0b100: 4,
  0b011: 5, 0b010: 6, 0b001: 7, 0b000: 8
};

/** 八卦属性映射表（1-8 对应乾兑离震巽坎艮坤） */
const BAGUA_MAPPING = {
  1: BAGUA_BINARY[0b111],
  2: BAGUA_BINARY[0b110],
  3: BAGUA_BINARY[0b101],
  4: BAGUA_BINARY[0b100],
  5: BAGUA_BINARY[0b011],
  6: BAGUA_BINARY[0b010],
  7: BAGUA_BINARY[0b001],
  8: BAGUA_BINARY[0b000]
};

/** 五行相生关系 */
const WUXING_SHENG = {
  "金": "水", "水": "木", "木": "火", "火": "土", "土": "金"
};

/** 五行相克关系 */
const WUXING_KE = {
  "金": "木", "木": "土", "土": "水", "水": "火", "火": "金"
};

/** 物品材质与五行对应 */
const MATERIAL_WUXING = {
  "金属": "金",
  "木质/植物": "木",
  "水/液体": "水",
  "火/电子产品": "火",
  "土/陶瓷/矿物": "土",
  "布料/纸张": "木",
  "不确定": "土"
};

/** 有效的物品材质枚举 */
const VALID_MATERIALS = Object.keys(MATERIAL_WUXING);

/** 天干 */
const TIAN_GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];

/** 地支 */
const DI_ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

/** 失物口诀表（基于日柱地支） */
const LOST_ITEM_RHYME = {
  "子": {
    direction: "正北",
    location: "水边、阴暗处、低洼地",
    finder: "男性、长辈、或穿黑衣之人",
    timeHint: "子日、子时可能找到"
  },
  "丑": {
    direction: "东北",
    location: "田园、仓库、牛棚附近、土堆旁",
    finder: "农夫、牧人、或身材敦实之人",
    timeHint: "丑日、丑时可能找到"
  },
  "寅": {
    direction: "东北",
    location: "山林、大树下、木器旁",
    finder: "青年男子、属虎之人、或身材高大之人",
    timeHint: "寅日、寅时可能找到"
  },
  "卯": {
    direction: "正东",
    location: "草木茂盛处、门窗附近、木制品旁",
    finder: "青年女子、属兔之人、或身材修长之人",
    timeHint: "卯日、卯时可能找到"
  },
  "辰": {
    direction: "东南",
    location: "水边、池塘、湿地、仓库",
    finder: "中年男子、属龙之人、或身材魁梧之人",
    timeHint: "辰日、辰时可能找到"
  },
  "巳": {
    direction: "东南",
    location: "火炉旁、厨房、明亮处、文书堆",
    finder: "中年女子、属蛇之人、或面色红润之人",
    timeHint: "巳日、巳时可能找到"
  },
  "午": {
    direction: "正南",
    location: "明亮处、高处、马厩附近、广场",
    finder: "年轻女子、属马之人、或性格急躁之人",
    timeHint: "午日、午时可能找到"
  },
  "未": {
    direction: "西南",
    location: "田园、羊圈附近、厨房、土堆",
    finder: "年长女子、属羊之人、或身材丰满之人",
    timeHint: "未日、未时可能找到"
  },
  "申": {
    direction: "西南",
    location: "金属物旁、道路交叉处、高处",
    finder: "青年男子、属猴之人、或身材灵活之人",
    timeHint: "申日、申时可能找到"
  },
  "酉": {
    direction: "正西",
    location: "金属器皿旁、鸡窝附近、缺口处",
    finder: "年轻女子、属鸡之人、或肤色白皙之人",
    timeHint: "酉日、酉时可能找到"
  },
  "戌": {
    direction: "西北",
    location: "土堆、墙壁旁、仓库、狗窝附近",
    finder: "年长男子、属狗之人、或身材健壮之人",
    timeHint: "戌日、戌时可能找到"
  },
  "亥": {
    direction: "西北",
    location: "水边、猪圈附近、阴暗处、低洼地",
    finder: "年长男子、属猪之人、或身材魁梧之人",
    timeHint: "亥日、亥时可能找到"
  }
};

/** 六十四卦寻物歌诀（带结构化 direction 字段） */
const HEXAGRAM_LOST_POEM = {
  "乾上乾下": { direction: "西北", poem: "乾卦寻物在西北，高处圆形金属旁。", detail: "物品在西北方向的高处，靠近金属物品或圆形物体。" },
  "乾上兑下": { direction: "西南", poem: "乾兑寻物西南方，水边缺口废弃物。", detail: "物品在西南方向，靠近水边或有缺口的地方。" },
  "乾上离下": { direction: "南方", poem: "乾离寻物在南方，明亮之处文书旁。", detail: "物品在南方，明亮的地方，靠近文书或电子产品。" },
  "乾上震下": { direction: "东方", poem: "乾震寻物在东方，木制品旁门窗边。", detail: "物品在东方，靠近木制品或门窗。" },
  "乾上巽下": { direction: "东南", poem: "乾巽寻物东南方，细长物品通风处。", detail: "物品在东南方，靠近细长物品或通风口。" },
  "乾上坎下": { direction: "北方", poem: "乾坎寻物在北方，阴暗低洼水旁边。", detail: "物品在北方，阴暗低洼的地方，靠近水源。" },
  "乾上艮下": { direction: "东北", poem: "乾艮寻物东北方，角落柜中高墙边。", detail: "物品在东北方，角落、柜子或高墙旁边。" },
  "乾上坤下": { direction: "西南", poem: "乾坤寻物西南方，平地柔软布料中。", detail: "物品在西南方，平地或柔软的布料中。" },
  "兑上乾下": { direction: "西北", poem: "兑乾寻物西北方，金属圆形高处寻。", detail: "物品在西北方，靠近金属圆形物体的高处。" },
  "兑上兑下": { direction: "正西", poem: "兑卦寻物正西方，水边缺口废弃物。", detail: "物品在正西方，靠近水边、缺口或废弃物。" },
  "兑上离下": { direction: "南方", poem: "兑离寻物在南方，明亮水边文书旁。", detail: "物品在南方，靠近水源和明亮处。" },
  "兑上震下": { direction: "东方", poem: "兑震寻物在东方，木器水边门窗旁。", detail: "物品在东方，靠近木器、水源或门窗。" },
  "兑上巽下": { direction: "东南", poem: "兑巽寻物东南方，细长水边通风处。", detail: "物品在东南方，靠近细长物品、水源或通风口。" },
  "兑上坎下": { direction: "北方", poem: "兑坎寻物在北方，阴暗水边低洼地。", detail: "物品在北方，阴暗的水边低洼处。" },
  "兑上艮下": { direction: "东北", poem: "兑艮寻物东北方，角落水边高墙旁。", detail: "物品在东北方，角落、水源或高墙旁边。" },
  "兑上坤下": { direction: "西南", poem: "兑坤寻物西南方，平地水边柔软处。", detail: "物品在西南方，平地、水源或柔软的地方。" },
  "离上乾下": { direction: "西北", poem: "离乾寻物西北方，高处明亮金属旁。", detail: "物品在西北方，高处明亮处，靠近金属。" },
  "离上兑下": { direction: "正西", poem: "离兑寻物正西方，明亮水边缺口处。", detail: "物品在正西方，明亮处，靠近水源或缺口。" },
  "离上离下": { direction: "正南", poem: "离卦寻物正南方，明亮高处文书旁。", detail: "物品在正南方，明亮高处，靠近文书。" },
  "离上震下": { direction: "东方", poem: "离震寻物在东方，明亮木器门窗边。", detail: "物品在东方，明亮处，靠近木器或门窗。" },
  "离上巽下": { direction: "东南", poem: "离巽寻物东南方，明亮细长通风处。", detail: "物品在东南方，明亮处，靠近细长物品或通风口。" },
  "离上坎下": { direction: "北方", poem: "离坎寻物在北方，阴暗明亮水旁边。", detail: "物品在北方，靠近水源，注意明暗交界。" },
  "离上艮下": { direction: "东北", poem: "离艮寻物东北方，角落明亮高墙边。", detail: "物品在东北方，角落明亮处，靠近高墙。" },
  "离上坤下": { direction: "西南", poem: "离坤寻物西南方，平地明亮柔软处。", detail: "物品在西南方，平地明亮处，柔软的地方。" },
  "震上乾下": { direction: "西北", poem: "震乾寻物西北方，高处木器金属旁。", detail: "物品在西北方，高处，靠近木器或金属。" },
  "震上兑下": { direction: "正西", poem: "震兑寻物正西方，木器水边缺口处。", detail: "物品在正西方，靠近木器、水源或缺口。" },
  "震上离下": { direction: "南方", poem: "震离寻物在南方，明亮木器文书旁。", detail: "物品在南方，明亮处，靠近木器或文书。" },
  "震上震下": { direction: "正东", poem: "震卦寻物正东方，木器高处门窗边。", detail: "物品在正东方，靠近木器、高处或门窗。" },
  "震上巽下": { direction: "东南", poem: "震巽寻物东南方，木器细长通风处。", detail: "物品在东南方，靠近木器、细长物品或通风口。" },
  "震上坎下": { direction: "北方", poem: "震坎寻物在北方，阴暗木器水旁边。", detail: "物品在北方，阴暗处，靠近木器或水源。" },
  "震上艮下": { direction: "东北", poem: "震艮寻物东北方，木器角落高墙边。", detail: "物品在东北方，靠近木器、角落或高墙。" },
  "震上坤下": { direction: "西南", poem: "震坤寻物西南方，平地木器柔软处。", detail: "物品在西南方，平地，靠近木器或柔软处。" },
  "巽上乾下": { direction: "西北", poem: "巽乾寻物西北方，高处细长金属旁。", detail: "物品在西北方，高处，靠近细长物品或金属。" },
  "巽上兑下": { direction: "正西", poem: "巽兑寻物正西方，细长水边缺口处。", detail: "物品在正西方，靠近细长物品、水源或缺口。" },
  "巽上离下": { direction: "南方", poem: "巽离寻物在南方，明亮细长文书旁。", detail: "物品在南方，明亮处，靠近细长物品或文书。" },
  "巽上震下": { direction: "东方", poem: "巽震寻物在东方，木器细长门窗边。", detail: "物品在东方，靠近木器、细长物品或门窗。" },
  "巽上巽下": { direction: "东南", poem: "巽卦寻物东南方，细长高处通风处。", detail: "物品在东南方，高处，靠近细长物品或通风口。" },
  "巽上坎下": { direction: "北方", poem: "巽坎寻物在北方，阴暗细长水旁边。", detail: "物品在北方，阴暗处，靠近细长物品或水源。" },
  "巽上艮下": { direction: "东北", poem: "巽艮寻物东北方，角落细长高墙边。", detail: "物品在东北方，角落，靠近细长物品或高墙。" },
  "巽上坤下": { direction: "西南", poem: "巽坤寻物西南方，平地细长柔软处。", detail: "物品在西南方，平地，靠近细长物品或柔软处。" },
  "坎上乾下": { direction: "西北", poem: "坎乾寻物西北方，高处阴暗金属旁。", detail: "物品在西北方，高处阴暗处，靠近金属。" },
  "坎上兑下": { direction: "正西", poem: "坎兑寻物正西方，阴暗水边缺口处。", detail: "物品在正西方，阴暗处，靠近水源或缺口。" },
  "坎上离下": { direction: "南方", poem: "坎离寻物在南方，明暗交界文书旁。", detail: "物品在南方，明暗交界处，靠近文书。" },
  "坎上震下": { direction: "东方", poem: "坎震寻物在东方，阴暗木器门窗边。", detail: "物品在东方，阴暗处，靠近木器或门窗。" },
  "坎上巽下": { direction: "东南", poem: "坎巽寻物东南方，阴暗细长通风处。", detail: "物品在东南方，阴暗处，靠近细长物品或通风口。" },
  "坎上坎下": { direction: "正北", poem: "坎卦寻物正北方，阴暗低洼水旁边。", detail: "物品在正北方，阴暗低洼处，靠近水源。" },
  "坎上艮下": { direction: "东北", poem: "坎艮寻物东北方，阴暗角落高墙边。", detail: "物品在东北方，阴暗角落，靠近高墙。" },
  "坎上坤下": { direction: "西南", poem: "坎坤寻物西南方，平地阴暗柔软处。", detail: "物品在西南方，平地阴暗处，柔软的地方。" },
  "艮上乾下": { direction: "西北", poem: "艮乾寻物西北方，高处角落金属旁。", detail: "物品在西北方，高处角落，靠近金属。" },
  "艮上兑下": { direction: "正西", poem: "艮兑寻物正西方，水边角落缺口处。", detail: "物品在正西方，靠近水源的角落或缺口。" },
  "艮上离下": { direction: "南方", poem: "艮离寻物在南方，明亮角落文书旁。", detail: "物品在南方，明亮角落，靠近文书。" },
  "艮上震下": { direction: "东方", poem: "艮震寻物在东方，木器角落门窗边。", detail: "物品在东方，靠近木器的角落或门窗。" },
  "艮上巽下": { direction: "东南", poem: "艮巽寻物东南方，细长角落通风处。", detail: "物品在东南方，角落，靠近细长物品或通风口。" },
  "艮上坎下": { direction: "北方", poem: "艮坎寻物在北方，阴暗角落水旁边。", detail: "物品在北方，阴暗角落，靠近水源。" },
  "艮上艮下": { direction: "东北", poem: "艮卦寻物东北方，高处角落墙壁边。", detail: "物品在东北方，高处角落，靠近墙壁。" },
  "艮上坤下": { direction: "西南", poem: "艮坤寻物西南方，平地角落柔软处。", detail: "物品在西南方，平地角落，柔软的地方。" },
  "坤上乾下": { direction: "西北", poem: "坤乾寻物西北方，高处平地金属旁。", detail: "物品在西北方，高处平地，靠近金属。" },
  "坤上兑下": { direction: "正西", poem: "坤兑寻物正西方，水边平地缺口处。", detail: "物品在正西方，平地，靠近水源或缺口。" },
  "坤上离下": { direction: "南方", poem: "坤离寻物在南方，明亮平地文书旁。", detail: "物品在南方，明亮平地，靠近文书。" },
  "坤上震下": { direction: "东方", poem: "坤震寻物在东方，木器平地门窗边。", detail: "物品在东方，平地，靠近木器或门窗。" },
  "坤上巽下": { direction: "东南", poem: "坤巽寻物东南方，细长平地通风处。", detail: "物品在东南方，平地，靠近细长物品或通风口。" },
  "坤上坎下": { direction: "北方", poem: "坤坎寻物在北方，阴暗平地水旁边。", detail: "物品在北方，阴暗平地，靠近水源。" },
  "坤上艮下": { direction: "东北", poem: "坤艮寻物东北方，平地角落高墙边。", detail: "物品在东北方，平地角落，靠近高墙。" },
  "坤上坤下": { direction: "西南", poem: "坤卦寻物西南方，平地柔软方形处。", detail: "物品在西南方，平地柔软处，靠近方形物品。" }
};

/** 房间类型与八卦环境映射 */
const ROOM_TYPE_MAPPING = {
  "玄关": { bagua: "艮", element: "土", features: ["鞋柜", "钥匙挂钩", "换鞋凳", "穿衣镜"] },
  "客厅": { bagua: "乾", element: "金", features: ["沙发", "茶几", "电视柜", "地毯"] },
  "卧室": { bagua: "坤", element: "土", features: ["床", "床头柜", "衣柜", "梳妆台"] },
  "厨房": { bagua: "离", element: "火", features: ["灶台", "冰箱", "橱柜", "水槽"] },
  "洗手间": { bagua: "坎", element: "水", features: ["马桶", "洗手台", "淋浴间", "镜子"] },
  "书房": { bagua: "巽", element: "木", features: ["书桌", "书架", "电脑", "文件柜"] },
  "阳台": { bagua: "震", element: "木", features: ["晾衣架", "花盆", "储物柜", "门窗"] },
  "餐厅": { bagua: "兑", element: "金", features: ["餐桌", "餐椅", "酒柜", "餐具柜"] },
  "储物间": { bagua: "艮", element: "土", features: ["货架", "箱子", "杂物", "工具"] },
  "走廊": { bagua: "乾", element: "金", features: ["鞋柜", "装饰画", "灯具", "地毯"] }
};

/** 门朝向到八卦二进制值的映射 */
const DOOR_DIRECTION_MAPPING = {
  "北": 0b010, "东北": 0b001, "东": 0b100, "东南": 0b011,
  "南": 0b101, "西南": 0b000, "西": 0b110, "西北": 0b111
};

/** 参考点类型 */
const REFERENCE_POINT_TYPES = ["current", "last_seen"];

// ============ 多算法融合推演引擎 ============

/**
 * 寻物推演引擎类
 * 融合梅花易数、失物口诀、六爻歌诀、位置环境分析等多种算法
 */
class DivinationEngine {
  constructor(config) {
    this.config = config;
  }

  // ========== 工具函数：编号与二进制转换 ==========

  /**
   * 将 1-8 的卦编号转换为 3 位二进制值
   * @param {number} index - 1-8 的卦编号
   * @returns {number} 3 位二进制值 (0-7)
   */
  indexToBinary(index) {
    return INDEX_TO_BINARY[index] || 0b000;
  }

  /**
   * 将 3 位二进制值转换为 1-8 的卦编号
   * @param {number} binary - 3 位二进制值 (0-7)
   * @returns {number} 1-8 的卦编号
   */
  binaryToIndex(binary) {
    return BINARY_TO_INDEX[binary & 0b111] || 8;
  }

  /**
   * 将上下卦编号组合为 6 位二进制本卦
   * @param {number} upperIndex - 上卦编号 (1-8)
   * @param {number} lowerIndex - 下卦编号 (1-8)
   * @returns {number} 6 位二进制值 (0-63)
   */
  combineHexagram(upperIndex, lowerIndex) {
    const upperBinary = this.indexToBinary(upperIndex);
    const lowerBinary = this.indexToBinary(lowerIndex);
    return (upperBinary << 3) | lowerBinary;
  }

  /**
   * 将 6 位二进制本卦拆分为上下卦编号
   * @param {number} hexagram - 6 位二进制值 (0-63)
   * @returns {Object} { upper, lower } 上下卦编号
   */
  splitHexagram(hexagram) {
    const upperBinary = (hexagram >> 3) & 0b111;
    const lowerBinary = hexagram & 0b111;
    return {
      upper: this.binaryToIndex(upperBinary),
      lower: this.binaryToIndex(lowerBinary)
    };
  }

  // ========== 算法1：梅花易数 ==========

  calculateHexagram(lostTimeStr, randomNumbers) {
    if (randomNumbers && randomNumbers.length >= 2) {
      const upper = randomNumbers[0] % 8 || 8;
      const lower = randomNumbers[1] % 8 || 8;
      const movingLine = randomNumbers.reduce((a, b) => a + b, 0) % 6 || 6;
      return { upper, lower, movingLine, mode: "报数起卦" };
    } else {
      const date = new Date(lostTimeStr.replace(' ', 'T'));
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const day = date.getDate();
      const hour = date.getHours();
      const upper = (year + month + day) % 8 || 8;
      const lower = (year + month + day + hour) % 8 || 8;
      const movingLine = (year + month + day + hour) % 6 || 6;
      return { upper, lower, movingLine, mode: "时间起卦" };
    }
  }

  analyzeTiYong(upper, lower, movingLine) {
    if (movingLine <= 3) {
      return { yong: lower, ti: upper };
    } else {
      return { yong: upper, ti: lower };
    }
  }

  /**
   * 计算互卦（使用位运算）
   * 互下卦 = 取本卦第 2,3,4 爻（bit 1,2,3）
   * 互上卦 = 取本卦第 3,4,5 爻（bit 2,3,4）
   * @param {number} upper - 上卦编号 (1-8)
   * @param {number} lower - 下卦编号 (1-8)
   * @returns {Object} { upper, lower } 互卦的上下卦编号
   */
  calculateHuGua(upper, lower) {
    const hexagram = this.combineHexagram(upper, lower);
    // 互下卦：取 bit 1,2,3 -> 右移1位后取低3位
    const huLowerBinary = (hexagram >> 1) & 0b111;
    // 互上卦：取 bit 2,3,4 -> 右移2位后取低3位
    const huUpperBinary = (hexagram >> 2) & 0b111;
    return {
      upper: this.binaryToIndex(huUpperBinary),
      lower: this.binaryToIndex(huLowerBinary)
    };
  }

  /**
   * 计算变卦（使用 XOR 位运算）
   * 变卦 = 本卦 XOR (1 << (动爻-1))
   * @param {number} upper - 上卦编号 (1-8)
   * @param {number} lower - 下卦编号 (1-8)
   * @param {number} movingLine - 动爻位置 (1-6)
   * @returns {Object} { upper, lower } 变卦的上下卦编号
   */
  calculateBianGua(upper, lower, movingLine) {
    const hexagram = this.combineHexagram(upper, lower);
    const bianHexagram = hexagram ^ (1 << (movingLine - 1));
    return this.splitHexagram(bianHexagram);
  }

  analyzeProbability(tiElement, yongElement) {
    if (tiElement === yongElement) {
      return { probability: "较高", advice: "物品可能就在你平时常放的地方，仔细找找即可。", relation: "比和", score: 70 };
    }
    if (WUXING_SHENG[yongElement] === tiElement) {
      return { probability: "极高", advice: "失物主动来寻，很快就能找到，保持平常心。", relation: "用生体", score: 90 };
    }
    if (WUXING_KE[tiElement] === yongElement) {
      return { probability: "中等", advice: "需要花费一些力气，重点去指定方向寻找。", relation: "体克用", score: 50 };
    }
    if (WUXING_KE[yongElement] === tiElement) {
      return { probability: "较低", advice: "寻找较为困难，建议扩大搜索范围或寻求他人帮助。", relation: "用克体", score: 30 };
    }
    if (WUXING_SHENG[tiElement] === yongElement) {
      return { probability: "很低", advice: "物品可能已被移动或损坏，建议顺其自然。", relation: "体生用", score: 10 };
    }
    return { probability: "未知", advice: "卦象复杂，建议多方位寻找。", relation: "未知", score: 40 };
  }

  // ========== 算法2：八字日柱失物口诀 ==========

  calculateBazi(date) {
    const lunar = Lunar.fromDate(date);
    const dayZhi = lunar.getDayZhi();
    return {
      year: lunar.getYearInGanZhi(),
      month: lunar.getMonthInGanZhi(),
      day: lunar.getDayInGanZhi(),
      hour: lunar.getTimeInGanZhi(),
      dayGan: lunar.getDayGan(),
      dayZhi: dayZhi,
      dayGanIndex: TIAN_GAN.indexOf(lunar.getDayGan()),
      dayZhiIndex: DI_ZHI.indexOf(dayZhi)
    };
  }

  analyzeLostItemRhyme(bazi) {
    const rhyme = LOST_ITEM_RHYME[bazi.dayZhi];
    if (!rhyme) return null;
    return {
      method: "失物口诀",
      basedOn: `日柱地支：${bazi.dayZhi}`,
      direction: rhyme.direction,
      location: rhyme.location,
      finder: rhyme.finder,
      timeHint: rhyme.timeHint,
      score: 60
    };
  }

  // ========== 算法3：六十四卦寻物歌诀 ==========

  analyzeHexagramPoem(hexagramName) {
    const poem = HEXAGRAM_LOST_POEM[hexagramName];
    if (!poem) return null;
    return {
      method: "六十四卦歌诀",
      basedOn: `卦名：${hexagramName}`,
      direction: poem.direction,
      poem: poem.poem,
      detail: poem.detail,
      score: 65
    };
  }

  // ========== 算法4：位置环境分析 ==========

  analyzeLocationContext(config) {
    const {
      current_location,
      last_seen_location,
      last_seen_time,
      reference_point,
      room_details,
      search_history,
      item_description,
      door_direction
    } = config;

    const analysis = {
      method: "位置环境分析",
      reference_point: reference_point === "last_seen" ? "最后见到位置" : "当前位置",
      base_location: reference_point === "last_seen" ? last_seen_location : current_location,
      time_gap: null,
      room_analysis: null,
      search_gap: [],
      score: 50
    };

    // 计算时间差
    if (last_seen_time && config.lost_time) {
      const lastSeen = new Date(last_seen_time.replace(' ', 'T'));
      const lost = new Date(config.lost_time.replace(' ', 'T'));
      const diffHours = Math.floor((lost - lastSeen) / (1000 * 60 * 60));
      analysis.time_gap = diffHours;
      if (diffHours <= 1) analysis.score += 20;
      else if (diffHours <= 3) analysis.score += 10;
      else if (diffHours <= 12) analysis.score += 0;
      else analysis.score -= 10;
    }

    // 房间类型分析（支持门朝向偏移）
    if (room_details && room_details.room_type) {
      const roomInfo = ROOM_TYPE_MAPPING[room_details.room_type];
      if (roomInfo) {
        let baguaName = roomInfo.bagua;
        let baguaIndex = this._getBaguaIndexByName(baguaName);

        // 如果提供了门朝向，根据朝向偏移计算房间八卦
        if (door_direction && DOOR_DIRECTION_MAPPING[door_direction] !== undefined) {
          const doorBinary = DOOR_DIRECTION_MAPPING[door_direction];
          const roomBinary = this.indexToBinary(baguaIndex);
          // 以门朝向为基准，偏移房间八卦
          const adjustedBinary = (roomBinary + doorBinary) & 0b111;
          baguaIndex = this.binaryToIndex(adjustedBinary);
          baguaName = BAGUA_MAPPING[baguaIndex].name.charAt(0);
        }

        analysis.room_analysis = {
          room_type: room_details.room_type,
          bagua: baguaName,
          element: BAGUA_MAPPING[baguaIndex].element,
          features: roomInfo.features,
          nearby_objects: room_details.nearby_objects || [],
          furniture: room_details.furniture || [],
          recent_activity: room_details.recent_activity || ""
        };
        analysis.score += 15;
      }
    }

    // 已搜索区域分析
    if (search_history && Array.isArray(search_history)) {
      analysis.search_gap = search_history;
      if (search_history.length === 0) analysis.score += 10;
    }

    // 物品描述分析
    if (item_description) {
      analysis.item_description = item_description;
      analysis.score += 5;
    }

    return analysis;
  }

  /**
   * 根据八卦名称获取编号
   * @param {string} name - 八卦名称（单字，如 "乾"）
   * @returns {number} 1-8 的卦编号
   */
  _getBaguaIndexByName(name) {
    const nameMap = { "乾": 1, "兑": 2, "离": 3, "震": 4, "巽": 5, "坎": 6, "艮": 7, "坤": 8 };
    return nameMap[name] || 1;
  }

  // ========== 算法融合 ==========

  fuseResults(meihuaResult, rhymeResult, poemResult, locationResult) {
    const directions = [];
    const environments = [];
    const scores = [];
    const methods = [];

    // 收集各算法结果（带权重）
    if (meihuaResult) {
      directions.push({ direction: meihuaResult.prediction.predicted_direction, weight: 0.40 });
      environments.push(meihuaResult.prediction.predicted_environment);
      scores.push({ score: meihuaResult.prediction.score || 50, weight: 0.40 });
      methods.push("梅花易数");
    }

    if (rhymeResult) {
      directions.push({ direction: rhymeResult.direction, weight: 0.15 });
      environments.push(rhymeResult.location);
      scores.push({ score: rhymeResult.score, weight: 0.15 });
      methods.push("失物口诀");
    }

    if (poemResult) {
      directions.push({ direction: poemResult.direction, weight: 0.15 });
      environments.push(poemResult.detail);
      scores.push({ score: poemResult.score, weight: 0.15 });
      methods.push("卦象歌诀");
    }

    if (locationResult) {
      if (locationResult.base_location) {
        directions.push({ direction: locationResult.base_location, weight: 0.30 });
      }
      if (locationResult.room_analysis) {
        const roomEnv = `${locationResult.room_analysis.room_type}内，靠近${locationResult.room_analysis.features.join('、')}`;
        environments.push(roomEnv);
      }
      scores.push({ score: locationResult.score, weight: 0.30 });
      methods.push("位置环境分析");
    }

    // 统计方向出现频率（按权重）
    const directionCount = {};
    directions.forEach(d => {
      directionCount[d.direction] = (directionCount[d.direction] || 0) + d.weight;
    });
    const bestDirection = Object.entries(directionCount)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || directions[0]?.direction;

    // 计算加权平均置信度
    let totalWeight = 0;
    let weightedScore = 0;
    scores.forEach(s => {
      weightedScore += s.score * s.weight;
      totalWeight += s.weight;
    });
    const avgScore = totalWeight > 0 ? weightedScore / totalWeight : 50;

    // 共振加分：口诀/歌诀方向与梅花易数一致时 +20%
    let resonanceBonus = 0;
    if (meihuaResult && rhymeResult && meihuaResult.prediction.predicted_direction === rhymeResult.direction) {
      resonanceBonus += 10;
    }
    if (meihuaResult && poemResult && meihuaResult.prediction.predicted_direction === poemResult.direction) {
      resonanceBonus += 10;
    }

    // 时间衰减：丢失超 72 小时，置信度 ×0.6
    let timeDecay = 1.0;
    if (locationResult && locationResult.time_gap !== null && locationResult.time_gap > 72) {
      timeDecay = 0.6;
    }

    const finalScore = Math.min((avgScore + resonanceBonus) * timeDecay, 95);

    // 确定综合概率
    let finalProbability;
    if (finalScore >= 80) finalProbability = "极高";
    else if (finalScore >= 60) finalProbability = "较高";
    else if (finalScore >= 40) finalProbability = "中等";
    else if (finalScore >= 20) finalProbability = "较低";
    else finalProbability = "很低";

    return {
      fused_direction: bestDirection,
      fused_environment: environments.join("；"),
      fused_probability: finalProbability,
      fused_score: Math.round(finalScore),
      methods_used: methods,
      direction_votes: directionCount,
      raw_results: { meihua: meihuaResult, rhyme: rhymeResult, poem: poemResult, location: locationResult }
    };
  }

  // ========== 主推演函数 ==========

  divinate(params) {
    const {
      item_name,
      item_material,
      lost_time,
      random_numbers,
      current_location,
      last_seen_location,
      last_seen_time,
      reference_point,
      room_details,
      search_history,
      item_description
    } = params;

    // 字段默认值处理
    const finalLostTime = lost_time || new Date().toISOString().replace('T', ' ').slice(0, 16);
    const finalItemMaterial = item_material || "不确定";

    const date = new Date(finalLostTime.replace(' ', 'T'));
    const itemElement = MATERIAL_WUXING[finalItemMaterial] || "土";

    // 算法1：梅花易数
    const { upper, lower, movingLine, mode } = this.calculateHexagram(finalLostTime, random_numbers);
    const { yong, ti } = this.analyzeTiYong(upper, lower, movingLine);
    const huGua = this.calculateHuGua(upper, lower);
    const bianGua = this.calculateBianGua(upper, lower, movingLine);
    const yongDetails = BAGUA_MAPPING[yong];
    const tiDetails = BAGUA_MAPPING[ti];
    const { probability, advice, relation, score } = this.analyzeProbability(tiDetails.element, yongDetails.element);
    const environment = `${yongDetails.environment}；互卦提示：${BAGUA_MAPPING[huGua.upper].environment}；变卦提示：${BAGUA_MAPPING[bianGua.upper].environment}`;

    const meihuaResult = {
      method: "梅花易数",
      prediction: {
        predicted_direction: yongDetails.direction,
        predicted_environment: environment,
        find_probability: probability,
        wuxing_relation: relation,
        actionable_advice: advice,
        score
      },
      hexagram: { mode, upper_gua: BAGUA_MAPPING[upper], lower_gua: BAGUA_MAPPING[lower], moving_line: movingLine },
      ti_yong: { ti: tiDetails, yong: yongDetails }
    };

    // 算法2：失物口诀
    const bazi = this.calculateBazi(date);
    const rhymeResult = this.analyzeLostItemRhyme(bazi);

    // 算法3：卦象歌诀
    const hexagramName = `${BAGUA_MAPPING[upper].name}上${BAGUA_MAPPING[lower].name}下`;
    const poemResult = this.analyzeHexagramPoem(hexagramName);

    // 算法4：位置环境分析
    const locationResult = this.analyzeLocationContext(params);

    // 融合结果
    const fused = this.fuseResults(meihuaResult, rhymeResult, poemResult, locationResult);

    return {
      item_info: {
        item_name,
        item_material: finalItemMaterial,
        item_element: itemElement,
        item_description: item_description || "未提供",
        lost_time: finalLostTime,
        random_numbers
      },
      location_info: {
        current_location: current_location || "未提供",
        last_seen_location: last_seen_location || "未提供",
        last_seen_time: last_seen_time || "未提供",
        reference_point: reference_point === "last_seen" ? "最后见到位置" : "当前位置",
        room_details: room_details || {},
        search_history: search_history || []
      },
      bazi: { year: bazi.year, month: bazi.month, day: bazi.day, hour: bazi.hour },
      meihua: meihuaResult,
      rhyme: rhymeResult,
      poem: poemResult,
      location_analysis: locationResult,
      fused,
      summary: this.generateSummary(item_name, fused, meihuaResult, locationResult)
    };
  }

  generateSummary(item_name, fused, meihua, location) {
    const methodText = fused.methods_used.join("、");
    const agreementText = Object.entries(fused.direction_votes)
      .filter(([_, count]) => count > 1)
      .map(([dir, count]) => `${dir}(${count}种算法一致)`)
      .join("、");

    let summary = `综合${methodText}四种算法推演，您遗失的${item_name}最有可能在${fused.fused_direction}方向。`;
    if (agreementText) {
      summary += `其中${agreementText}，可信度较高。`;
    }
    if (location && location.base_location) {
      summary += `以${location.base_location}为基准点，`;
    }
    summary += `综合置信度${fused.fused_score}%，寻回概率${fused.fused_probability}。`;
    summary += `建议：${meihua.prediction.actionable_advice}`;
    return summary;
  }
}

// ============ CLI 命令处理 ============

function showHelp() {
  console.log(`
易经寻物 Skill - 多算法融合的遗失物品找回工具

使用方法:
  node main.js <command> [options]

命令:
  find       执行寻物推演（融合梅花易数+失物口诀+卦象歌诀+位置环境分析）
  validate   验证配置文件
  explain    解释推演结果
  help       显示帮助信息

选项:
  --configFile <path>   配置文件路径（find/validate 必需）
  --resultFile <path>   结果文件路径（explain 必需）
  --output <path>       输出文件路径（可选）

示例:
  node main.js find --configFile ./config.json
  node main.js find --configFile ./config.json --output ./result.json
  node main.js validate --configFile ./config.json
  node main.js explain --resultFile ./result.json
`);
}

function readJsonFile(filePath) {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`文件不存在: ${absolutePath}`);
  }
  const content = fs.readFileSync(absolutePath, 'utf-8');
  return JSON.parse(content);
}

function writeJsonFile(filePath, data) {
  const absolutePath = path.resolve(filePath);
  const dir = path.dirname(absolutePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(absolutePath, JSON.stringify(data, null, 2), 'utf-8');
}

function cmdFind(args) {
  if (!args.configFile) {
    console.error('错误: 请提供 --configFile 参数');
    process.exit(1);
  }

  const config = readJsonFile(args.configFile);
  const engine = new DivinationEngine(config);
  const result = engine.divinate(config);

  if (args.output) {
    writeJsonFile(args.output, result);
    console.log(`推演结果已保存到: ${path.resolve(args.output)}`);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}

function cmdValidate(args) {
  if (!args.configFile) {
    console.error('错误: 请提供 --configFile 参数');
    process.exit(1);
  }

  const config = readJsonFile(args.configFile);
  const errors = [];

  // 必填字段验证（缩减为 item_name 和 request_time）
  if (!config.item_name) errors.push('缺少 item_name 字段（物品名称）');
  if (!config.request_time) errors.push('缺少 request_time 字段（请求时间）');

  // 可选字段验证
  if (config.item_material && !VALID_MATERIALS.includes(config.item_material)) {
    errors.push(`无效的物品材质: ${config.item_material}，可选: ${VALID_MATERIALS.join(', ')}`);
  }

  if (config.lost_time) {
    const date = new Date(config.lost_time.replace(' ', 'T'));
    if (isNaN(date.getTime())) {
      errors.push('lost_time 格式无效，请使用 YYYY-MM-DD HH:mm 格式');
    }
  }

  if (config.last_seen_time) {
    const date = new Date(config.last_seen_time.replace(' ', 'T'));
    if (isNaN(date.getTime())) {
      errors.push('last_seen_time 格式无效，请使用 YYYY-MM-DD HH:mm 格式');
    }
  }

  if (config.reference_point && !REFERENCE_POINT_TYPES.includes(config.reference_point)) {
    errors.push(`无效的 reference_point: ${config.reference_point}，可选: ${REFERENCE_POINT_TYPES.join(', ')}`);
  }

  if (config.random_numbers !== undefined) {
    if (!Array.isArray(config.random_numbers)) {
      errors.push('random_numbers 必须是数组');
    } else if (config.random_numbers.length > 0 && config.random_numbers.length < 2) {
      errors.push('random_numbers 如果提供，至少需要 2 个数字');
    }
  }

  if (config.room_details && config.room_details.room_type) {
    if (!ROOM_TYPE_MAPPING[config.room_details.room_type]) {
      errors.push(`无效的房间类型: ${config.room_details.room_type}，可选: ${Object.keys(ROOM_TYPE_MAPPING).join(', ')}`);
    }
  }

  if (errors.length > 0) {
    console.error('验证失败:');
    errors.forEach(err => console.error(`  - ${err}`));
    process.exit(1);
  } else {
    console.log('配置文件验证通过！');
    console.log('提示：提供越详细的位置信息（current_location, last_seen_location, room_details等），推演结果越准确。');
  }
}

function cmdExplain(args) {
  if (!args.resultFile) {
    console.error('错误: 请提供 --resultFile 参数');
    process.exit(1);
  }

  const result = readJsonFile(args.resultFile);
  const f = result.fused;
  const m = result.meihua;
  const loc = result.location_analysis;

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║              易经寻物推演结果详解（多算法融合）              ║
╚══════════════════════════════════════════════════════════════╝

【物品信息】
  物品名称: ${result.item_info.item_name}
  物品材质: ${result.item_info.item_material}
  物品五行: ${result.item_info.item_element}
  物品描述: ${result.item_info.item_description}
  遗失时间: ${result.item_info.lost_time}

【位置信息】
  当前位置: ${result.location_info.current_location}
  最后见到位置: ${result.location_info.last_seen_location}
  最后见到时间: ${result.location_info.last_seen_time}
  参考基准点: ${result.location_info.reference_point}
  已搜索区域: ${result.location_info.search_history.join(', ') || '无'}

【八字信息】
  年柱: ${result.bazi.year}
  月柱: ${result.bazi.month}
  日柱: ${result.bazi.day}
  时柱: ${result.bazi.hour}

【梅花易数推演】
  起卦方式: ${m.hexagram.mode}
  上卦: ${m.hexagram.upper_gua.name}（${m.hexagram.upper_gua.element}）
  下卦: ${m.hexagram.lower_gua.name}（${m.hexagram.lower_gua.element}）
  动爻: 第 ${m.hexagram.moving_line} 爻
  体卦: ${m.ti_yong.ti.name}（${m.ti_yong.ti.element}）
  用卦: ${m.ti_yong.yong.name}（${m.ti_yong.yong.element}）
  预测方位: ${m.prediction.predicted_direction}
  五行关系: ${m.prediction.wuxing_relation}

【失物口诀推演】
  ${result.rhyme ? `
  基于: ${result.rhyme.basedOn}
  预测方位: ${result.rhyme.direction}
  可能位置: ${result.rhyme.location}
  可能发现者: ${result.rhyme.finder}
  时间提示: ${result.rhyme.timeHint}
  ` : "  未启用（需要准确的农历日期）"}

【卦象歌诀推演】
  ${result.poem ? `
  基于: ${result.poem.basedOn}
  歌诀: ${result.poem.poem}
  详解: ${result.poem.detail}
  ` : "  未启用"}

【位置环境分析】
  ${loc ? `
  参考基准点: ${loc.reference_point}
  基准位置: ${loc.base_location}
  时间差: ${loc.time_gap !== null ? loc.time_gap + '小时' : '未知'}
  ${loc.room_analysis ? `
  房间类型: ${loc.room_analysis.room_type}
  对应八卦: ${loc.room_analysis.bagua}（${loc.room_analysis.element}）
  房间特征: ${loc.room_analysis.features.join('、')}
  附近物品: ${loc.room_analysis.nearby_objects.join('、')}
  家具: ${loc.room_analysis.furniture.join('、')}
  近期活动: ${loc.room_analysis.recent_activity}
  ` : ''}
  已搜索: ${loc.search_gap.join(', ') || '无'}
  ` : "  未提供位置信息"}

【多算法融合结果】
  使用算法: ${f.methods_used.join("、")}
  综合方位: ${f.fused_direction}
  综合环境: ${f.fused_environment}
  综合置信度: ${f.fused_score}%
  寻回概率: ${f.fused_probability}
  方向投票: ${JSON.stringify(f.direction_votes)}

【行动建议】
  ${m.prediction.actionable_advice}

【综合总结】
  ${result.summary}
`);
}

// ============ 主入口 ============

function main() {
  const args = parseArgs();
  const command = args._[0] || 'help';

  switch (command) {
    case 'find':
      cmdFind(args);
      break;
    case 'validate':
      cmdValidate(args);
      break;
    case 'explain':
      cmdExplain(args);
      break;
    case 'help':
    default:
      showHelp();
      break;
  }
}

function parseArgs() {
  const args = { _: [] };
  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (value && !value.startsWith('--')) {
        args[key] = value;
        i++;
      } else {
        args[key] = true;
      }
    } else if (arg.startsWith('-')) {
      const key = arg.slice(1);
      const value = argv[i + 1];
      if (value && !value.startsWith('-')) {
        args[key] = value;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(arg);
    }
  }

  return args;
}

if (require.main === module) {
  main();
}

module.exports = {
  DivinationEngine,
  BAGUA_MAPPING,
  WUXING_SHENG,
  WUXING_KE,
  MATERIAL_WUXING,
  LOST_ITEM_RHYME,
  HEXAGRAM_LOST_POEM,
  ROOM_TYPE_MAPPING,
  DOOR_DIRECTION_MAPPING,
  BAGUA_BINARY,
  INDEX_TO_BINARY,
  BINARY_TO_INDEX
};
