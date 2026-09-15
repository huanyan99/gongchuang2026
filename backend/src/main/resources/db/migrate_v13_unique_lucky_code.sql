-- 执行前检查重复号码；如果存在重复，请人工核实，不能自动更换已发号码。
SELECT lucky_code, COUNT(*) AS total FROM gonghcuang_lottery_draw
GROUP BY lucky_code HAVING COUNT(*) > 1;

-- 与新版号码生成服务一起部署。存在重复时此语句会失败，不会改动原号码。
ALTER TABLE gonghcuang_lottery_draw
ADD CONSTRAINT uk_lottery_lucky_code UNIQUE (lucky_code);
