# Project Rules & Guidelines

## 1. Superpowers Methodology (obra/superpowers)
Use the skills in "https://github.com/obra/superpowers" that are relevant to the current task.
Run `npx skills add "https://github.com/obra/superpowers"` (or use the skills installed in `.agents/skills/`) and select the relevant skills, then follow their instructions.

### Key Engineering Workflows:
- **`using-superpowers`**: Identify and invoke applicable skills before taking implementation actions.
- **`brainstorming`**: For new features, components, or behavioral changes, clarify requirements, categorize scope (Spike, Bounded, Architectural), present designs, and obtain explicit user approval before coding.
- **`test-driven-development`**: Follow Red-Green-Refactor. No production code without a failing test first.
- **`systematic-debugging`**: Investigate root cause before attempting fixes. Trace data flow, find working patterns, and form testable hypotheses.
- **`writing-plans` & `executing-plans` / `subagent-driven-development`**: Decompose work into discrete verifiable tasks, using subagents where appropriate.
- **`verification-before-completion`**: Rigorously verify against acceptance criteria and run automated test suites before claiming task completion.

## 2. Anthropic Specialized Skills (anthropics/skills)
Use the skills in "https://github.com/anthropics/skills" that are relevant to the current task.
Run `npx skills add "https://github.com/anthropics/skills"` (or use the skills installed in `.agents/skills/`) and select the relevant skills, then follow their instructions.

### Key Domain Workflows:
- **`frontend-design`**: Distinctive, intentional visual design; avoid generic AI templates; purposeful typography, color palette, active voice, and layout.
- **`webapp-testing`**: Automate and verify web UI and flows using Playwright (`with_server.py`, DOM inspection, screenshot validation).
- **`web-artifacts-builder`**: Elaborate multi-component web interfaces (React, Tailwind CSS, shadcn/ui).
- **`doc-coauthoring`**: Structured documentation, technical specifications, and decision docs.
- **`xlsx`, `pdf`, `docx`, `pptx`**: Domain document generation and data processing (spreadsheets, reports, receipts, presentations).

## 3. Project Progress Tracking Requirement
- Tệp theo dõi tiến độ: `PROJECT_PROGRESS.md` nằm tại thư mục gốc dự án.
- BẮT BUỘC cập nhật `PROJECT_PROGRESS.md` mỗi khi hoàn thành một đầu việc, chuyển đổi trạng thái checklist, hoặc bắt đầu/kết thúc một Phase công việc.

## 4. Quy Tắc Thao Tác Git & Commit Chuẩn Chỉ (Git Workflow & Professional Vietnamese Commits)
Mỗi khi hoàn thành một task/đầu việc theo các file plan (`KE_HOACH_TRIEN_KHAI.md`, `BUILD_PLAN.md`, `PROJECT_PROGRESS.md`), BẮT BUỘC thực hiện quy trình Git nghiêm ngặt:

### Quy trình Git chuẩn chỉ:
1. **Kiểm tra trạng thái**: Chạy `git status` và `git diff` để rà soát chính xác các file đã thay đổi.
2. **Kiểm tra an toàn**: Tuyệt đối không commit tệp nhạy cảm (`.env`, secrets, credentials), dependencies (`node_modules`), hay build artifacts.
3. **Stage tệp có chọn lọc**: Dùng `git add <tệp_cụ_thể>` bám sát đúng phạm vi của task, tránh `git add .` bừa bãi.
4. **Cập nhật tiến độ**: Đảm bảo đã cập nhật trạng thái checklist trong file plan/`PROJECT_PROGRESS.md` trước hoặc cùng commit của task.

### Quy chuẩn Git Commit Message (Tiếng Việt Không Dấu Chuyên Nghiệp):
Tuân thủ nghiêm ngặt định dạng **Conventional Commits** với nội dung mô tả bằng **tiếng Việt KHÔNG DẤU chuyên nghiệp, chuẩn kỹ thuật**:
- **Cấu trúc**: `<type>(<scope>): <mo ta hanh dong bang tieng Viet khong dau ngan gon, ro rang>`
- **Các type chuẩn**:
  - `feat`: Tính năng mới (VD: `feat(pos): hoan thien tinh nang chon modifier bat buoc va tinh tong tien`)
  - `fix`: Sửa lỗi (VD: `fix(kds): khac phuc loi do tre cap nhat trang thai don qua websocket`)
  - `test`: Viết/cập nhật kiểm thử (VD: `test(auth): bo sung bo test kiem thu dang nhap jwt va rbac`)
  - `refactor`: Tái cấu trúc code (VD: `refactor(backend): chuan hoa dto va error handling cho express routes`)
  - `docs`: Tài liệu, kế hoạch (VD: `docs(plan): cap nhat tien do task 2 va quy tac git commit`)
  - `chore`: Cấu hình, công cụ, môi trường (VD: `chore(toolchain): khoi tao repo, cau hinh gitignore va npm workspaces`)
  - `style`: Giao diện, styling, CSS (VD: `style(ui): hoan thien bang mau vang cam crispy bite va typography`)
- **Yêu cầu nội dung message**:
  - Viết bằng tiếng Việt KHÔNG DẤU, cấu trúc ngữ pháp kỹ thuật rõ ràng, súc tích.
  - Tuyệt đối không viết mơ hồ, chung chung (như: "update code", "xong task", "fix bug").
  - Thể hiện chính xác kết quả kỹ thuật đạt được trong task.
