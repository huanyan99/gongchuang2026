# -*- coding: utf-8 -*-
"""核对并补齐批量导入人员的抽奖码：佛山1xxx / 济南6xxx / 上海8xxx，后三位不含4。"""
import pymysql, random

PREFIX = {'佛山': '1', '济南': '6', '上海': '8'}
DIGITS = '012356789'

conn = pymysql.connect(host='mysql2.sqlpub.com', port=3307, user='public_ku',
                       password='C9eWdQGUfebSTYCV', database='public_ku', connect_timeout=15)
cur = conn.cursor()

cur.execute("""
SELECT g.name, g.phone, g.guest_index, COALESCE(inv.event_city, '') AS city,
       u.id AS user_id, d.lucky_code
FROM gonghcuang_application_guest g
JOIN gonghcuang_application a ON a.id = g.application_id
LEFT JOIN gonghcuang_invitation inv ON inv.code = a.invitation_code
LEFT JOIN gonghcuang_user u ON u.openid = CONCAT('web:', g.phone)
LEFT JOIN gonghcuang_lottery_draw d ON d.user_id = u.id
ORDER BY inv.event_city, a.id, g.guest_index
""")
people = cur.fetchall()

cur.execute("SELECT lucky_code FROM gonghcuang_lottery_draw")
used = {r[0] for r in cur.fetchall()}

random.seed()
need_user, need_draw, wrong_prefix, ok, no_city = [], [], [], 0, []
for name, phone, guest_index, city, user_id, code in people:
    prefix = PREFIX.get(city, '')
    if not prefix:
        no_city.append((name, phone))
        continue
    if not user_id:
        need_user.append((name, phone, city))
    elif code and code.startswith(prefix) and '4' not in code:
        ok += 1
    elif code:
        wrong_prefix.append((name, phone, code, city))
    else:
        need_draw.append((user_id, name, phone, city))

print('总人数:', len(people))
print('已有合规码:', ok)
print('缺账号(需建号+发码):', len(need_user))
print('有账号缺码(需发码):', len(need_draw))
print('码前缀错误(需修正):', len(wrong_prefix), wrong_prefix[:5])
print('未知场次:', no_city[:5])

random.seed()
changed = False

# 1. 缺账号的：建 web:手机号 账号 + 发码
for name, phone, city in need_user:
    openid = 'web:' + phone
    cur.execute("INSERT INTO gonghcuang_user (openid, name, phone) VALUES (%s, %s, %s)", (openid, name, phone))
    user_id = cur.lastrowid
    prefix = PREFIX.get(city, '1')
    while True:
        code = prefix + ''.join(random.choice(DIGITS) for _ in range(3))
        if code not in used:
            break
    used.add(code)
    cur.execute("INSERT INTO gonghcuang_lottery_draw (user_id, lucky_code) VALUES (%s, %s)", (user_id, code))
    changed = True
    print('  建号发码:', name, phone, '→', code)

# 2. 有账号缺码的：发码（按其场次前缀）
for user_id, name, phone, city in need_draw:
    prefix = PREFIX.get(city, '1')
    while True:
        code = prefix + ''.join(random.choice(DIGITS) for _ in range(3))
        if code not in used:
            break
    used.add(code)
    cur.execute("INSERT INTO gonghcuang_lottery_draw (user_id, lucky_code) VALUES (%s, %s)", (user_id, code))
    changed = True
    print('  发码:', name, phone, '→', code)

# 3. 前缀错误的：换成本场前缀且不含4的新码
for name, phone, code, city in wrong_prefix:
    prefix = PREFIX.get(city, '1')
    while True:
        new_code = prefix + ''.join(random.choice(DIGITS) for _ in range(3))
        if new_code not in used:
            break
    used.add(new_code)
    cur.execute("UPDATE gonghcuang_lottery_draw SET lucky_code=%s WHERE lucky_code=%s", (new_code, code))
    changed = True
    print('  换码:', name, code, '→', new_code)

if changed:
    conn.commit()
    print('已提交')
else:
    print('无需改动')

# 最终核对
cur.execute("""
SELECT COALESCE(inv.event_city, '') AS city, d.lucky_code
FROM gonghcuang_application_guest g
JOIN gonghcuang_application a ON a.id = g.application_id
LEFT JOIN gonghcuang_invitation inv ON inv.code = a.invitation_code
LEFT JOIN gonghcuang_user u ON u.openid = CONCAT('web:', g.phone)
JOIN gonghcuang_lottery_draw d ON d.user_id = u.id
""")
final = cur.fetchall()
bad = [(c, code) for c, code in final if '4' in code or (c in PREFIX and not code.startswith(PREFIX[c]))]
print('最终核对: 有码人数', len(final), '| 不合规:', bad if bad else '无')
conn.close()
