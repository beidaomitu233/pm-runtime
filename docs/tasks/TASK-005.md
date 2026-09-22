# TASK-005 TXT/MD/DOCX 文件导入

状态：待开发  
依赖：TASK-004  
业务目标：在已有 Meeting 闭环上增加真实文件导入，支持 TXT、MD、DOCX，并保持与粘贴导入完全相同的 ready meeting、正文分块和错误处理语义。

Desktop 通过 Tauri 文件选择器只选择单文件；Runtime 识别允许类型并执行大小/文件签名/解析安全检查。TXT/MD 正式支持 UTF-8 与 UTF-8 BOM，其他编码返回明确错误，不猜测转换。DOCX 只提取正文与表格文本，不执行宏、脚本、外部链接或嵌入对象，并限制 zip entry 数、总解压量和压缩比。默认单文件 10 MiB，解析后的文本仍受 Meeting 最大字符限制。

完整链路：文件选择 → import API/multipart → 安全检查 → parser → 规范 UTF-8 文本 → 文件/DB 原子提交 → ready meeting → 列表与详情立即可查看。取消选择不产生任何业务记录；解析失败不产生 ready meeting。

允许修改 Tauri picker、ImportMeetingDialog、meeting-import 领域代码、meeting contracts 与安全测试。不得改变 Meeting 表的核心语义或绕过 TASK-004 的文件事务。

验收至少包含：正常 TXT、MD、包含中文段落与表格的 DOCX 均成功；损坏 DOCX、扩展名伪装、非 UTF-8 文本、超大文件、zip bomb fixture 明确失败；成功文件可以通过已有正文分块接口完整读取，失败文件不会污染正式目录。测试不得使用真实客户会议材料。
