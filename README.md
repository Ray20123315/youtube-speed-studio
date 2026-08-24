# youtube-speed-studio

`youtube-speed-studio` 是 Ray20123315 製作的 Chrome / Edge Manifest V3 影片播放控制與 YouTube Download Studio 擴充功能。正式公開版從 **1.0.0** 開始。

官方來源：`Ray20123315/youtube-speed-studio`。如果你取得的檔案不是來自官方 GitHub repository / Releases，請使用 Options → 外觀與語言 → 完整性驗證檢查 Build Fingerprint。

## 主要功能

### 播放控制
- 一般 YouTube 影片與 Shorts 可使用不同倍速。
- bilibili HTML5 影片支援倍速、快捷鍵、懸浮窗與位置保存。
- 自製 `− / 數值 / +` 控制，不使用瀏覽器 number spinner。
- 極速模式最高 16×；最後一步會精準吸附 16×。
- 自訂每次增減、Boost、按住回 1×、鎖定速度、preservesPitch。
- 點懸浮窗中央倍速可在 `1× ↔ 設定倍速` 暫時切換。
- Hover 展開模式、Preset、搜尋結果頁隱藏。
- 拖曳位置在 pointer-up 立即寫入 `chrome.storage.local`，並在頁面離開/隱藏前 flush，避免重新整理後回預設位置。

### Smart Profile
YouTube 支援：
1. 播放清單 Profile（最高優先）
2. 頻道 Profile
3. 全域設定

Profile 保存一般/Shorts 倍速、Boost、速度鎖定與原音調設定。

### Download Studio
- 顯示「播放器可選最高 / player data 宣告最高 / 可下載最高 / resolver 狀態」。
- 不再因 resolver 只能取得低畫質就把 240p 冒充影片最高畫質。
- Progressive MP4 可直接交給 Chrome Downloads。
- Adaptive MP4 video + AAC audio 可在擴充頁面本機 remux 成單一 MP4。
- Video / Audio / Mux / Finalizing 進度與 Cancel/Abort。
- 大檔案記憶體防護。
- signed Googlevideo URL 僅短暫存在 runtime memory，不寫入 storage、Diagnostics、Git 或專案記憶。
- YouTube 近年的 GVS PO Token、SABR、client policy 會影響第三方 resolver 能取得的格式；因此「播放器可播放」不等於「本擴充必定可取得直接下載 URL」。本專案不處理 Widevine/DRM 或付費授權繞過。

### 自製 UI
- Popup / Options 的可見 dropdown 使用自製 Select/Popover。
- 語言選單支援搜尋。
- Reset 使用自製兩階段 Modal，不使用 `window.confirm()` / `prompt()`。
- 重大 Reset：第一階段確認風險，第二階段必須輸入 `RESET YOUTUBE-SPEED-STUDIO`。
- Checkbox / Toggle / Range / scrollbar 都有自製視覺，不依賴原生 spinner/select 外觀。
- Options 版面採較緊湊的 1040px 內容寬度與較大字級，減少不必要留白。

### 語言
完整內建 UI 翻譯：
- 繁體中文 `zh-Hant`
- 简体中文 `zh-Hans`
- English `en`

語言搜尋器內建 70+ 個常見 BCP-47 locale（涵蓋東亞、東南亞、歐洲、中東、南亞與非洲常用語言）；繁體中文、简体中文與 English 為完整 UI 語言，其餘尚未完整翻譯的 locale 明確使用 English fallback。搜尋可同時比對語言名稱與 locale code，後續可持續加入完整翻譯，而不會把 fallback 冒充成完整翻譯。

### 外觀
Accent presets：Violet、Blue、Cyan、Green、Amber、Orange、Rose、Magenta。

Background presets：Follow site、Dark、Light、Graphite、Midnight、Warm。

透明度為 `0–100`，預設 `90`，支援自製滑桿與直接輸入數字並雙向同步。

## Runtime 自我修復
擴充更新或重新載入後，已開啟的 YouTube/bilibili 分頁可能沒有新版本 content runtime。1.0.0 的 Popup/Options 會：
1. 先對分頁做 `YTSS_GET_RUNTIME` handshake。
2. 若沒有 receiving end，使用 `chrome.scripting` 對受支援分頁補注入 MAIN-world bridge、Provider、content runtime 與 CSS。
3. 重新 handshake。
4. 分開顯示「runtime 未存在」「runtime 已連線但不是影片頁」「影片頁已連線」「版本過舊」。

因此不再把所有情況統一顯示成「未連線」。

## 更新提醒
GitHub/未封裝版本不能可靠地像 Chrome Web Store 一樣靜默自我覆蓋。本專案採安全的提醒策略：
- Service worker 每 12 小時檢查官方 `Ray20123315/youtube-speed-studio` 最新 Release。
- 有新版時 Toolbar badge 顯示 `UP`。
- Popup/Options 顯示新版版本與官方 Release 入口。
- 使用者自行下載官方 Release 後更新。

## 官方 Build / 防偽
1.0.0 包含 `integrity.json`：
- 關鍵 extension files 的 SHA-256。
- Build Fingerprint。
- 官方 owner/repository/version metadata。

Background service worker 可重新讀取 extension 自身檔案並核對 SHA-256，Options 顯示 `OFFICIAL` 或驗證失敗。

**重要限制：**瀏覽器端 JavaScript 無法在技術上做到「任何人絕對無法修改」。攻擊者若能任意改整個擴充，也能嘗試移除驗證器。因此本功能是 tamper-evident 防偽與官方 Build 辨識，不是不可破解 DRM。法律上的修改/重散布限制由 `LICENSE` 控制。

## 權限
Manifest 1.0.0：
- `storage`：保存設定/Profile/位置/更新與完整性狀態。
- `downloads`：輸出下載檔。
- `scripting`：更新/重新載入後自動補注入 runtime。
- `alarms`：定期檢查官方 Release。

Host permissions：
- `youtube.com`：runtime 自動修復。
- `bilibili.com`：runtime 自動修復。
- `googlevideo.com`：Download Studio 取得已解析媒體串流。
- `api.github.com`：官方 Release 更新檢查。

## 安裝
### GitHub Release
1. 到官方 repository 的 **Releases**。
2. 下載 `youtube-speed-studio_1.0.0.zip` 與 `.sha256`。
3. 驗證 SHA-256。
4. 解壓 ZIP。
5. Chrome/Edge 開啟 Extensions 頁面。
6. 啟用 Developer mode。
7. 選擇 **Load unpacked / 載入未封裝項目**。
8. 選取解壓後、含 `manifest.json` 的資料夾。

### 更新
看到 `UP` 後前往官方 Releases，下載新版並以新版資料夾重新載入；設定保存在 extension storage。若 Chrome 對不同 extension ID 視為新擴充，先使用「匯出設定 JSON」備份，再匯入新版。

## 設定備份
Options → 診斷與資料：
- 匯出診斷 JSON（不含 signed media URL）
- 匯出設定 JSON
- 匯入設定 JSON

## 重大 Reset
Reset 與一般按鈕刻意分開放在 Danger Zone。按下後不會直接重設：
1. 確認理解風險。
2. 輸入 `RESET YOUTUBE-SPEED-STUDIO`。
3. 才執行恢復預設。

## License
Copyright © 2026 **Ray20123315**. All rights reserved.

這不是開源授權。官方未修改 Build 僅授權下載、安裝與使用；除必要備份外，任何修改、衍生、重新包裝、鏡像、重新發布、再散布、販售、移除防偽/所有權標示或冒充官方 Build，除非取得 Ray20123315 書面授權，均不在授權範圍內。完整條款見 [`LICENSE`](LICENSE)。第三方權利見 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。

## Release 驗證
GitHub `main` push 會由 `.github/workflows/release.yml`：
1. 驗證 `manifest.json` 版本 1.0.0。
2. 重新產生 integrity manifest 並確認沒有 drift。
3. 打包 extension ZIP。
4. 計算 SHA-256。
5. 建立不可覆蓋的 `v1.0.0` GitHub Release。
