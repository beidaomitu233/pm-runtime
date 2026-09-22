# TASK-003 导入会议与完整分块读取

对应 R02/R09；来源 §3.2、§4.2、§12、A02。依赖 TASK-002。

业务目标：把粘贴文本和 TXT/MD/DOCX 保存为不可变、可追溯的会议。

入口：Meetings → 粘贴/选择文件 → 查看标题建议、解析预览与警告 → 保存 → 原文查看/复制 meeting_id。预览截取必须标明，正文不能截断；保存失败保留用户输入。导入原始附件复制到数据根，不依赖原路径以后存在。

主要修改：features/meetings、runtime/modules/meetings、文件 staging、Mammoth 适配、文本规范化/分块模块；接口 meeting.preview_import/create/list/get 与会议 schema。不要写任意路径读取 MCP 工具。

约定：BOM/换行处理、Unicode 码点区间、8000 码点分块、SHA256、导入 token、工程上限按 API_CONTRACT；正文不允许原地编辑。选择文件在 Electron main 中完成，Runtime 不接受客户端绝对 path。

异常：空白全文、编码错误、损坏/加密 DOCX、不支持格式、解压超限、解析超时、import_token 过期/跨项目使用、磁盘满。明确提示无法提取图片文字；不把图片型会议报告为完整导入。

验收：粘贴、TXT、MD、DOCX 各一例，保存后删除外部源文件仍可查看已保存正文；50,000 汉字 + emoji + CRLF 的长文按块拼接 hash 与规范化原文相同，所有 start/end 连续无重叠缺口；原文查看重启仍可用。`npm test -- meetings` 覆盖这些集成条件以及越界 chunk、错误编码、损坏 DOCX、重试仅一条记录。
