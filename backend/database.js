// database.js — 数据库初始化与操作
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// 数据库文件存储路径（Railway 持久卷）
const DB_DIR = process.env.DB_DIR || path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'app.db');

// 确保目录存在
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// 开启 WAL 模式提升并发性能
db.pragma('journal_mode = WAL');

// ─── 建表 ────────────────────────────────────────────────────────────────────

db.exec(`
  -- 预约表（于总就餐 + 接待任务）
  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('normal_lunch','reception')),  -- 普通午餐预约 / 接待任务预约
    requester TEXT NOT NULL,        -- 申请人
    guest_count INTEGER,            -- 来宾人数
    guest_info TEXT,                -- 来宾单位/身份
    visit_date TEXT NOT NULL,       -- 到访日期 yyyy-MM-dd
    visit_time TEXT,                -- 到访时间 HH:mm
    leave_time TEXT,                -- 预计离开时间
    meal_type TEXT,                 -- 午餐/晚餐/仅茶叙
    areas TEXT,                     -- 区域需求（JSON字符串）
    dinner_plan TEXT,               -- 晚餐方案
    special_diet TEXT,              -- 特殊饮食要求
    other_notes TEXT,               -- 其他备注
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );

  -- 申报审批表（接待信息确认单）
  CREATE TABLE IF NOT EXISTS approvals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    form_no TEXT,                   -- 单号（自动生成）
    submitter TEXT NOT NULL,        -- 提交人（冯洋/王倩）
    reception_date TEXT NOT NULL,   -- 接待日期
    visit_time TEXT,
    leave_time TEXT,
    guest_count INTEGER,
    guest_info TEXT,
    meal_type TEXT,
    areas TEXT,
    dinner_plan TEXT,
    hired_chef_name TEXT,
    hired_chef_phone TEXT,
    hired_chef_health_cert INTEGER DEFAULT 0,
    special_diet TEXT,
    other_needs TEXT,
    reception_type TEXT,            -- 标准接待/应急接待
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
    reviewer TEXT,                  -- 审批人
    review_comment TEXT,            -- 审批意见
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );

  -- 检查任务表（检查项目模板）
  CREATE TABLE IF NOT EXISTS check_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,         -- 分类：pre_reception/post_reception/kitchen_safety
    item TEXT NOT NULL,             -- 检查项目内容
    sort_order INTEGER DEFAULT 0
  );

  -- 检查记录表（实际打勾记录）
  CREATE TABLE IF NOT EXISTS check_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,       -- 本次检查批次ID（日期+类别）
    category TEXT NOT NULL,
    template_id INTEGER,
    item TEXT NOT NULL,
    checked INTEGER DEFAULT 0,     -- 0=未完成 1=已完成
    checker TEXT,                  -- 打勾人
    checked_at TEXT,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  -- 厨房食品安全检查表
  CREATE TABLE IF NOT EXISTS kitchen_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    check_date TEXT NOT NULL,       -- 检查日期
    checker TEXT NOT NULL,          -- 检查人
    fridge_temp_ok INTEGER DEFAULT 0,        -- 冰箱温度正常（4°C以下）
    freezer_temp_ok INTEGER DEFAULT 0,       -- 冷冻室温度正常（-18°C以下）
    fifo_followed INTEGER DEFAULT 0,         -- 先进先出原则执行
    raw_cooked_separated INTEGER DEFAULT 0,  -- 生熟分开存放
    overnight_soaked_discarded INTEGER DEFAULT 0, -- 隔夜泡发食材已丢弃
    expired_removed INTEGER DEFAULT 0,       -- 过期食材已清除
    cutting_board_cleaned INTEGER DEFAULT 0, -- 砧板已清洁消毒
    stove_cleaned INTEGER DEFAULT 0,         -- 灶台已清洁
    floor_cleaned INTEGER DEFAULT 0,         -- 厨房地面已清洁
    trash_removed INTEGER DEFAULT 0,         -- 垃圾已清理
    fridge_contents TEXT,           -- 冰箱现有食材（文字记录）
    notes TEXT,                     -- 备注
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  -- 系统公告/通知
  CREATE TABLE IF NOT EXISTS notices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT,
    author TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
`);

// ─── 初始化检查项目模板 ────────────────────────────────────────────────────────

const templateCount = db.prepare('SELECT COUNT(*) as c FROM check_templates').get();
if (templateCount.c === 0) {
  const insertTemplate = db.prepare(
    'INSERT INTO check_templates (category, item, sort_order) VALUES (?, ?, ?)'
  );

  const preReceptionItems = [
    '接待信息确认单已填写完毕',
    '来宾人数、到访时间、用餐类型已确认',
    '晚餐方案已确认（如有晚餐）',
    '外聘厨师资质已审核（如有外聘）',
    '食材采购清单已提报并审批',
    '食材已采购到位（T日上午9:00前）',
    '公共物料（茶叶/纸巾/餐具）备量已核查',
    '餐厅桌椅已清洁摆放',
    '餐具已摆放就位',
    '茶水已准备（热水/茶叶/杯具）',
    '掼蛋房已清洁布置（如需）',
    '扑克/骰子等物品已备好（如需）',
    '顶楼露天花园桌椅已清洁摆放（如需）',
    '烧烤设备已就位（如需烧烤）',
    '车辆已确认可用，郭峰已就位',
    '王倩已在接待区域就位（来宾到访前≥10分钟）',
    '布置已经冯洋验收确认',
  ];

  const postReceptionItems = [
    '餐具已清洗收纳',
    '桌面已清洁',
    '椅子已复位',
    '餐厅垃圾已清理',
    '厨房灶台已清洁',
    '锅具已收纳',
    '厨房地面已清理',
    '掼蛋房牌桌已复位（如使用）',
    '顶楼户外桌椅已归位（如使用）',
    '顶楼垃圾已清除（如使用）',
    '物料消耗已更新台账',
    '接待记录已填写（来宾信息/费用/问题）',
    '场地已经冯洋验收确认',
  ];

  const kitchenSafetyItems = [
    '冰箱温度已检查（冷藏≤4°C）',
    '冷冻室温度已检查（≤-18°C）',
    '先进先出原则执行（旧食材在前）',
    '生熟食材分区存放',
    '隔夜泡发木耳/银耳已丢弃',
    '过期/变质食材已清除',
    '生食砧板与熟食砧板分开使用',
    '砧板已清洁消毒',
    '灶台已清洁',
    '操作台已清洁消毒',
    '油烟机已清洁（每周检查）',
    '厨房地面已清洁',
    '厨余垃圾已清理',
    '炸油未超过3次使用（如有油炸）',
    '亚麻籽油/胡麻油已放置阴凉处（不可加热）',
  ];

  const insertAll = db.transaction(() => {
    preReceptionItems.forEach((item, i) =>
      insertTemplate.run('pre_reception', item, i + 1)
    );
    postReceptionItems.forEach((item, i) =>
      insertTemplate.run('post_reception', item, i + 1)
    );
    kitchenSafetyItems.forEach((item, i) =>
      insertTemplate.run('kitchen_safety', item, i + 1)
    );
  });
  insertAll();
}

module.exports = db;
