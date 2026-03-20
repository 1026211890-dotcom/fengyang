// server.js — 8楼私人接待中心管理系统 后端服务
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── 中间件 ────────────────────────────────────────────────────────────────────
app.use(cors());
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// 托管前端静态文件
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ─── 工具函数 ──────────────────────────────────────────────────────────────────
function success(res, data, message = '成功') {
  return res.json({ code: 0, message, data });
}

function fail(res, message = '操作失败', status = 400) {
  return res.status(status).json({ code: 1, message, data: null });
}

function generateFormNo(prefix) {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefix}-${dateStr}-${rand}`;
}

// ─── 健康检查 ──────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ code: 0, message: '服务正常运行', data: { time: new Date().toLocaleString('zh-CN') } });
});

// ════════════════════════════════════════════════════════════════════════════════
// 预约 API
// ════════════════════════════════════════════════════════════════════════════════

// 获取预约列表
app.get('/api/reservations', (req, res) => {
  try {
    const { date, type, status } = req.query;
    let sql = 'SELECT * FROM reservations WHERE 1=1';
    const params = [];
    if (date) { sql += ' AND visit_date = ?'; params.push(date); }
    if (type) { sql += ' AND type = ?'; params.push(type); }
    if (status) { sql += ' AND status = ?'; params.push(status); }
    sql += ' ORDER BY visit_date DESC, visit_time ASC';
    const rows = db.prepare(sql).all(...params);
    // 解析JSON字段
    rows.forEach(r => {
      try { r.areas = JSON.parse(r.areas || '{}'); } catch { r.areas = {}; }
    });
    success(res, rows);
  } catch (e) {
    fail(res, e.message, 500);
  }
});

// 新建预约
app.post('/api/reservations', (req, res) => {
  try {
    const {
      type, requester, guest_count, guest_info,
      visit_date, visit_time, leave_time,
      meal_type, areas, dinner_plan,
      special_diet, other_notes
    } = req.body;

    if (!type || !requester || !visit_date) {
      return fail(res, '缺少必填字段：type, requester, visit_date');
    }

    const areasStr = typeof areas === 'object' ? JSON.stringify(areas) : (areas || '{}');

    const stmt = db.prepare(`
      INSERT INTO reservations
        (type, requester, guest_count, guest_info, visit_date, visit_time, leave_time,
         meal_type, areas, dinner_plan, special_diet, other_notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      type, requester, guest_count || null, guest_info || null,
      visit_date, visit_time || null, leave_time || null,
      meal_type || null, areasStr, dinner_plan || null,
      special_diet || null, other_notes || null
    );
    const newRecord = db.prepare('SELECT * FROM reservations WHERE id = ?').get(result.lastInsertRowid);
    success(res, newRecord, '预约提交成功');
  } catch (e) {
    fail(res, e.message, 500);
  }
});

// 更新预约状态
app.patch('/api/reservations/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return fail(res, '状态值无效');
    }
    db.prepare(`
      UPDATE reservations SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?
    `).run(status, id);
    const updated = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
    success(res, updated, '状态已更新');
  } catch (e) {
    fail(res, e.message, 500);
  }
});

// 删除预约
app.delete('/api/reservations/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM reservations WHERE id = ?').run(req.params.id);
    success(res, null, '已删除');
  } catch (e) {
    fail(res, e.message, 500);
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// 申报审批 API
// ════════════════════════════════════════════════════════════════════════════════

// 获取申报列表
app.get('/api/approvals', (req, res) => {
  try {
    const { status, date } = req.query;
    let sql = 'SELECT * FROM approvals WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (date) { sql += ' AND reception_date = ?'; params.push(date); }
    sql += ' ORDER BY created_at DESC';
    const rows = db.prepare(sql).all(...params);
    rows.forEach(r => {
      try { r.areas = JSON.parse(r.areas || '{}'); } catch { r.areas = {}; }
    });
    success(res, rows);
  } catch (e) {
    fail(res, e.message, 500);
  }
});

// 提交申报
app.post('/api/approvals', (req, res) => {
  try {
    const body = req.body;
    if (!body.submitter || !body.reception_date) {
      return fail(res, '缺少必填字段');
    }
    const formNo = generateFormNo('JD');
    const areasStr = typeof body.areas === 'object' ? JSON.stringify(body.areas) : (body.areas || '{}');

    const stmt = db.prepare(`
      INSERT INTO approvals
        (form_no, submitter, reception_date, visit_time, leave_time, guest_count, guest_info,
         meal_type, areas, dinner_plan, hired_chef_name, hired_chef_phone,
         hired_chef_health_cert, special_diet, other_needs, reception_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      formNo, body.submitter, body.reception_date, body.visit_time || null,
      body.leave_time || null, body.guest_count || null, body.guest_info || null,
      body.meal_type || null, areasStr, body.dinner_plan || null,
      body.hired_chef_name || null, body.hired_chef_phone || null,
      body.hired_chef_health_cert ? 1 : 0,
      body.special_diet || null, body.other_needs || null,
      body.reception_type || '标准接待'
    );
    const newRecord = db.prepare('SELECT * FROM approvals WHERE id = ?').get(result.lastInsertRowid);
    success(res, newRecord, `申报单 ${formNo} 已提交`);
  } catch (e) {
    fail(res, e.message, 500);
  }
});

// 审批操作
app.patch('/api/approvals/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { status, reviewer, review_comment } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return fail(res, '审批状态无效');
    }
    db.prepare(`
      UPDATE approvals SET status = ?, reviewer = ?, review_comment = ?,
        updated_at = datetime('now','localtime') WHERE id = ?
    `).run(status, reviewer || '冯洋', review_comment || '', id);
    const updated = db.prepare('SELECT * FROM approvals WHERE id = ?').get(id);
    success(res, updated, status === 'approved' ? '已审批通过' : '已驳回');
  } catch (e) {
    fail(res, e.message, 500);
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// 检查打勾 API
// ════════════════════════════════════════════════════════════════════════════════

// 获取检查模板
app.get('/api/check-templates', (req, res) => {
  try {
    const { category } = req.query;
    let sql = 'SELECT * FROM check_templates WHERE 1=1';
    const params = [];
    if (category) { sql += ' AND category = ?'; params.push(category); }
    sql += ' ORDER BY category, sort_order';
    const rows = db.prepare(sql).all(...params);
    success(res, rows);
  } catch (e) {
    fail(res, e.message, 500);
  }
});

// 获取某次检查记录（按 session_id）
app.get('/api/check-records', (req, res) => {
  try {
    const { session_id, category, date } = req.query;
    let sql = 'SELECT * FROM check_records WHERE 1=1';
    const params = [];
    if (session_id) { sql += ' AND session_id = ?'; params.push(session_id); }
    if (category) { sql += ' AND category = ?'; params.push(category); }
    if (date) { sql += ' AND date(created_at) = ?'; params.push(date); }
    sql += ' ORDER BY id';
    const rows = db.prepare(sql).all(...params);
    success(res, rows);
  } catch (e) {
    fail(res, e.message, 500);
  }
});

// 初始化一次检查（从模板创建打勾记录）
app.post('/api/check-records/init', (req, res) => {
  try {
    const { category, checker } = req.body;
    if (!category) return fail(res, '缺少 category');

    const today = new Date().toISOString().slice(0, 10);
    const sessionId = `${today}-${category}-${Date.now()}`;

    const templates = db.prepare(
      'SELECT * FROM check_templates WHERE category = ? ORDER BY sort_order'
    ).all(category);

    const insert = db.prepare(`
      INSERT INTO check_records (session_id, category, template_id, item, checked, checker)
      VALUES (?, ?, ?, ?, 0, ?)
    `);
    const insertAll = db.transaction(() => {
      templates.forEach(t => insert.run(sessionId, category, t.id, t.item, checker || ''));
    });
    insertAll();

    const records = db.prepare('SELECT * FROM check_records WHERE session_id = ?').all(sessionId);
    success(res, { session_id: sessionId, records }, '检查已初始化');
  } catch (e) {
    fail(res, e.message, 500);
  }
});

// 更新单个打勾项
app.patch('/api/check-records/:id', (req, res) => {
  try {
    const { checked, checker, note } = req.body;
    const checkedAt = checked ? new Date().toLocaleString('zh-CN') : null;
    db.prepare(`
      UPDATE check_records SET checked = ?, checker = ?, note = ?, checked_at = ? WHERE id = ?
    `).run(checked ? 1 : 0, checker || null, note || null, checkedAt, req.params.id);
    const updated = db.prepare('SELECT * FROM check_records WHERE id = ?').get(req.params.id);
    success(res, updated);
  } catch (e) {
    fail(res, e.message, 500);
  }
});

// 获取历史检查会话列表
app.get('/api/check-sessions', (req, res) => {
  try {
    const { category } = req.query;
    let sql = `
      SELECT session_id, category,
             COUNT(*) as total,
             SUM(checked) as done,
             MAX(created_at) as created_at,
             MAX(checker) as checker
      FROM check_records WHERE 1=1
    `;
    const params = [];
    if (category) { sql += ' AND category = ?'; params.push(category); }
    sql += ' GROUP BY session_id ORDER BY MAX(created_at) DESC LIMIT 30';
    const rows = db.prepare(sql).all(...params);
    success(res, rows);
  } catch (e) {
    fail(res, e.message, 500);
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// 厨房食品安全 API
// ════════════════════════════════════════════════════════════════════════════════

// 获取厨房检查列表
app.get('/api/kitchen-checks', (req, res) => {
  try {
    const { date } = req.query;
    let sql = 'SELECT * FROM kitchen_checks WHERE 1=1';
    const params = [];
    if (date) { sql += ' AND check_date = ?'; params.push(date); }
    sql += ' ORDER BY check_date DESC, created_at DESC LIMIT 60';
    const rows = db.prepare(sql).all(...params);
    success(res, rows);
  } catch (e) {
    fail(res, e.message, 500);
  }
});

// 提交厨房安全检查
app.post('/api/kitchen-checks', (req, res) => {
  try {
    const b = req.body;
    if (!b.check_date || !b.checker) {
      return fail(res, '缺少检查日期或检查人');
    }
    const stmt = db.prepare(`
      INSERT INTO kitchen_checks
        (check_date, checker, fridge_temp_ok, freezer_temp_ok, fifo_followed,
         raw_cooked_separated, overnight_soaked_discarded, expired_removed,
         cutting_board_cleaned, stove_cleaned, floor_cleaned, trash_removed,
         fridge_contents, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      b.check_date, b.checker,
      b.fridge_temp_ok ? 1 : 0,
      b.freezer_temp_ok ? 1 : 0,
      b.fifo_followed ? 1 : 0,
      b.raw_cooked_separated ? 1 : 0,
      b.overnight_soaked_discarded ? 1 : 0,
      b.expired_removed ? 1 : 0,
      b.cutting_board_cleaned ? 1 : 0,
      b.stove_cleaned ? 1 : 0,
      b.floor_cleaned ? 1 : 0,
      b.trash_removed ? 1 : 0,
      b.fridge_contents || null,
      b.notes || null
    );
    const newRecord = db.prepare('SELECT * FROM kitchen_checks WHERE id = ?').get(result.lastInsertRowid);
    success(res, newRecord, '厨房安全检查已记录');
  } catch (e) {
    fail(res, e.message, 500);
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// SPA 回退路由（所有非 /api 路由返回前端 index.html）
// ════════════════════════════════════════════════════════════════════════════════
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// ─── 启动服务器 ────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ 8楼管理系统服务已启动：http://localhost:${PORT}`);
  console.log(`📁 数据库位置：${require('./database').name || '已初始化'}`);
});

module.exports = app;
