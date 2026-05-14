# 🔮 易经寻物 (Yijing Find Lost Item)

> 通过中国传统易经（梅花易数）原理，结合多算法融合与 AI 辅助，推演遗失物品的大致方位、所处环境及找回概率。

[![Version](https://img.shields.io/badge/version-3.0.0-blue.svg)](./package.json)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen.svg)](./package.json)

---

## ✨ 核心特性

- **🎯 多算法融合**：梅花易数（40%）+ 八字日柱失物口诀（15%）+ 六十四卦寻物歌诀（15%）+ 位置环境分析（30%）
- **🔢 二进制爻象计算**：使用位运算精确计算互卦（234/345爻提取）和变卦（XOR动爻取反）
- **📅 农历干支精确计算**：基于 `lunar-javascript` 专业天文农历库，确保八字日柱准确
- **🏠 动态房间八卦映射**：支持大门朝向参数，根据实际风水调整房间八卦属性
- **⏰ 时间衰减因子**：丢失超过72小时自动降低置信度并提示"卦象微弱"
- **🎭 置信度共振加分**：多算法方向一致时触发额外加分
- **📝 极简信息收集**：仅需物品名称即可推演，其余信息由 AI 自动推断或可选补充
- **🌐 中英文双语支持**：覆盖中英文自然语言触发表达

---

## 🚀 快速开始

### 安装

```bash
# 克隆仓库
git clone https://github.com/4682B4LEE/yijing-find-lost-item.git
cd yijing-find-lost-item

# 安装依赖
npm install
```

### 使用方式

#### 方式一：完整配置（推荐，结果更精准）

创建 `config.json`：

```json
{
  "item_name": "家门钥匙",
  "request_time": "2026-05-14 14:30",
  "item_material": "金属",
  "lost_time": "2026-05-14 14:30",
  "last_seen_location": "家中玄关",
  "current_location": "家中客厅",
  "door_direction": "朝南",
  "room_details": {
    "room_type": "玄关",
    "nearby_objects": ["鞋柜", "钥匙挂钩"]
  },
  "search_history": ["客厅沙发"],
  "random_numbers": [7, 2]
}
```

运行推演：

```bash
# 验证配置
npm run validate

# 执行推演
npm run find

# 解读结果
npm run explain

# 或一键执行全部
npm test
```

#### 方式二：极简配置（仅需物品名称）

创建 `config-minimal.json`：

```json
{
  "item_name": "钱包",
  "request_time": "2026-05-14 14:30"
}
```

```bash
node main.js validate --configFile ./config-minimal.json
node main.js find --configFile ./config-minimal.json --output ./result.json
node main.js explain --resultFile ./result.json
```

---

## 📋 配置字段说明

### 必填字段（2个）

| 字段 | 类型 | 说明 |
|------|------|------|
| `item_name` | string | 丢失物品名称，如"钥匙"、"钱包" |
| `request_time` | string | 请求时间，系统自动注入，格式 `YYYY-MM-DD HH:mm` |

### 可选字段

| 字段 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| `item_material` | string | 物品材质：金属/木质/水/火/土/布料/不确定 | AI自动推断 |
| `lost_time` | string | 发现丢失时间 `YYYY-MM-DD HH:mm` | 当前系统时间 |
| `last_seen_time` | string | 最后见到时间 | - |
| `last_seen_location` | string | 最后见到位置 | - |
| `current_location` | string | 当前位置 | - |
| `reference_point` | string | 方位基准：`current` 或 `last_seen` | - |
| `door_direction` | string | 大门朝向：北/东北/东/东南/南/西南/西/西北 | - |
| `room_details` | object | 房间详情，含 `room_type`、`nearby_objects` 等 | - |
| `search_history` | array | 已搜索区域列表 | - |
| `random_numbers` | array | 随心数字（2-3个整数），用于报数起卦 | 时间起卦 |

---

## 🏗️ 项目结构

```
yijing-find-lost-item/
├── main.js                    # 核心推演引擎
├── skill.md                   # Skill 调度中心（工作流定义）
├── prompt.md                  # System Prompt（AI 人设与交互）
├── config.json                # 完整配置示例
├── config-minimal.json        # 极简配置示例
├── package.json               # 项目元数据
├── README.md                  # 本文档
└── references/
    ├── theory/
    │   ├── MEIHUA_YISHU.md    # 梅花易数理论
    │   ├── BAGUA_PROPERTIES.md # 八卦属性表
    │   └── WUXING_RELATIONS.md # 五行生克关系
    └── examples/
        └── DIVINATION_CASES.md # 寻物案例参考
```

---

## 🧮 算法原理

### 1. 梅花易数起卦

- **报数起卦**（优先）：用户随心报 2-3 个数字
- **时间起卦**（备选）：基于丢失时间的年月日时起卦

### 2. 二进制爻象计算

```
八卦二进制映射：
乾=111(7)  兑=110(6)  离=101(5)  震=100(4)
巽=011(3)  坎=010(2)  艮=001(1)  坤=000(0)

本卦 = 上卦(3位) << 3 | 下卦(3位)  →  6位二进制

互卦：
  互下卦 = 取本卦第 2,3,4 爻  →  (hexagram >> 1) & 0b111
  互上卦 = 取本卦第 3,4,5 爻  →  (hexagram >> 2) & 0b111

变卦：
  变卦 = 本卦 XOR (1 << (动爻-1))  →  动爻位取反
```

### 3. 多算法融合权重

| 算法 | 权重 | 说明 |
|------|------|------|
| 梅花易数 | 40% | 核心算法，提供主要方位和环境基准 |
| 八字日柱失物口诀 | 15% | 基于日柱地支的传统口诀 |
| 六十四卦寻物歌诀 | 15% | 基于卦象的古文歌诀 |
| 位置环境分析 | 30% | 结合房间类型、搜索历史等现实因素 |

**共振加分**：口诀/歌诀方向与梅花易数一致时 +20%

**时间衰减**：丢失超过72小时，综合置信度 ×0.6

---

## 🎭 触发词与唤醒语

### 中文触发

- "帮我找找我的..."
- "我的...不见了"
- "我丢了..."
- "算一下我的...在哪"
- "...可能在哪"
- "怎么找回..."

### 英文触发

- "help me find my..."
- "I lost my..."
- "where is my..."
- "divine where my...is"
- "where could my...be"

> 当用户表达丢失物品、寻找物品、询问物品方位等意图时，自动触发本 Skill。

---

## 📖 使用示例

### 示例 1：寻找钥匙

```bash
# 配置
{
  "item_name": "家门钥匙",
  "request_time": "2026-05-14 14:30",
  "item_material": "金属",
  "lost_time": "2026-05-14 14:30",
  "last_seen_location": "家中玄关",
  "door_direction": "朝南",
  "room_details": {
    "room_type": "玄关",
    "nearby_objects": ["鞋柜", "钥匙挂钩"]
  },
  "random_numbers": [7, 2]
}

# 结果输出
=== 易经寻物推演结果 ===
物品：家门钥匙
起卦时间：2026年5月14日 14时30分（基于当前时刻）
起卦方式：报数起卦（7, 2）
本卦：山火贲（艮上离下）
体卦：艮（土）- 代表失主
用卦：离（火）- 代表失物
互卦：雷水解（震上坎下）
变卦：艮为山（艮上艮下）

方位推断：
- 主方向：东北（艮）
- 辅助方向：西南（坤）
- 环境特征：高处、土性物品附近、静止不动

位置环境分析：
- 房间类型：玄关（艮卦）
- 大门朝向：朝南（离卦）
- 建议搜索：鞋柜上方、钥匙挂钩附近、包包内

寻回概率：较高（约 75%）
建议：物品在玄关附近，重点检查鞋柜上方和钥匙挂钩，可能掉在包包内。
```

---

## 🛠️ CLI 命令

```bash
# 验证配置格式
node main.js validate --configFile <config.json>

# 执行推演
node main.js find --configFile <config.json> --output <result.json>

# 解读推演结果
node main.js explain --resultFile <result.json>

# 查看帮助
node main.js help
```

---

## 📦 依赖

- [lunar-javascript](https://github.com/6tail/lunar-javascript) - 专业天文农历库，用于精确计算八字干支

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

## 📄 许可证

[MIT License](./LICENSE)

---

## 🙏 致谢

- 梅花易数理论参考：《梅花易数》（宋·邵雍）
- 八卦五行理论参考：《易经》传统注解
- 农历计算库：[lunar-javascript](https://github.com/6tail/lunar-javascript)

---

> **免责声明**：本 Skill 基于中国传统易经文化进行推演，结果仅供参考，不构成任何决策依据。请理性看待推演结果。
