# TASK-004 会议粘贴导入与分块查看

状态：待开发  
依赖：TASK-003  
对应验收：A02 的文本路径  
业务目标：用户能够在项目中粘贴长会议记录，Runtime 安全保存规范文本和元数据，Desktop 可以查看会议列表、详情、meeting ID 与分块正文，宿主后续可以复用同一读取能力。

完整链路：Meetings 页面粘贴 title/text → `POST /projects/:id/meetings` → meeting service → 临时文件/规范化/hash → DB transaction → 原子文件落盘 → ready meeting → 列表/详情 → `GET /meetings/:id/content` 分块读取。

实现 meetings migration、文件目录事务和恢复所需的最小状态；粘贴正文规范化为 UTF-8，保留字符数和 SHA-256。5 万中文字符是必须验收下限；当前默认最大规范文本 200 万字符，以 settings/contract 实际锁定值为准。分块读取按字符 offset/limit，默认 8000、最大 20000，必须正确处理中文、emoji 和多字节边界。

前端完成会议列表、粘贴会议对话框、导入结果、Meeting Detail 和 ChunkedTextViewer。正式数据必须来自真实 API，不能用硬编码列表。失败导入不能出现 ready meeting 指向缺失正文文件；日志和错误不得包含完整会议正文。

允许修改 meetings UI/API/service/repository、文件存储、meetings migration/contracts；不包含 TXT/MD/DOCX 文件解析和 MCP。

验收：粘贴不少于 5 万中文字符后 UI 不冻结，保存成功可复制 meeting ID；从 offset=0 连续读取到 hasMore=false 后拼接文本与规范文本完全一致；刷新和重启后会议仍可读取。空正文、超限、DB 提交失败、磁盘写入失败、正文文件缺失、非法 offset 都要有明确错误并保持数据一致。
