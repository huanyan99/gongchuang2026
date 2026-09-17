-- 执行前检查：结果必须为空。手机号代表唯一参会人，历史重复数据需要先人工合并。
SELECT phone, COUNT(*) AS total
FROM gonghcuang_application_guest
GROUP BY phone
HAVING COUNT(*) > 1;

-- 确认上方无结果后执行，防止同一手机号被加入多个登记团组。
ALTER TABLE gonghcuang_application_guest
ADD CONSTRAINT uk_application_guest_phone UNIQUE (phone);
