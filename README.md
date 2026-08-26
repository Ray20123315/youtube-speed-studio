# youtube-speed-studio

`youtube-speed-studio` 是 Ray20123315 製作的 Chrome / Edge Manifest V3 影片播放控制與 YouTube Download Studio 擴充功能。正式公開版從 **1.0.0** 開始，目前版本為 **1.0.5.12**。

官方來源：`Ray20123315/youtube-speed-studio`。正式 Build 自 1.0.5.12 起採用離線私鑰簽署的密碼學防偽鎖；若套件檔案被未授權修改，擴充會進入 `TAMPER LOCK`。

## 主要功能

### 播放控制
- YouTube 一般影片與 Shorts 可使用不同倍速。
- bilibili HTML5 影片支援倍速、快捷鍵與懸浮控制。
- 自製 `− / 數值 / +` 控制，不使用瀏覽器 number spinner。
- 極速模式最高 16×，支援 Boost、按住回 1×、鎖定速度與 `preservesPitch`。
- Smart Profile 可依 YouTube 播放清單／頻道套用一般影片、Shorts、Boost、Lock 與原音調設定。
- 懸浮窗支援拖曳、位置記憶、Hover 展開、主題與透明度。
- **快速 Preset `1× / 1.25× / 1.5× / 2× / 3×` 目前暫時鎖定**，待控制生命週期問題完全修復後再正式開放。

### Download Studio（測試中）
- 分開顯示播放器可選畫質、player response 宣告畫質、已解析媒體 URL 與最終 MP4 可下載狀態。
- Progressive MP4 可直接下載；Adaptive MP4 Video + AAC Audio 可在擴充頁面本機 remux 成單一 MP4。
- 顯示 Video / Audio / Mux / Finalizing 進度與取消功能，並有 Adaptive 記憶體防護。
- Popup 開啟 Download Studio 時會攜帶原始 YouTube `sourceTabId` / `sourceUrl`，避免來源分頁誤判。
- signed `googlevideo` URL 僅短暫存在 runtime memory，不寫入 storage、diagnostics、Git 或專案記憶。
- YouTube 現行 GVS PO Token、SABR、client policy 會影響第三方 resolver；「播放器可播放」不代表一定能取得可重用下載 URL。
- 專案不處理 Widevine/DRM 或付費授權繞過。
- Download Studio 目前仍屬測試功能；進入時先顯示未完善說明，通過本機測試門檻後才顯示完整介面。

## 外觀與語言

完整 UI 語言：
- 繁體中文 `zh-Hant`
- 简体中文 `zh-Hans`
- English `en`

其他列出的 locale 目前明確使用 English fallback，直到有完整翻譯包。

Accent presets：Violet、Blue、Cyan、Green、Amber、Orange、Rose、Magenta。Popup、Options、Download Studio 與懸浮控制器共用 Accent token；Danger／Error 等語意色保持獨立。

## Runtime 自我修復

擴充更新或重新載入後，已開啟的 YouTube / bilibili 分頁可能保留舊 content script，但舊 extension context 已失效。專案具有 runtime bootstrap / recovery / source hint 機制，會嘗試重新建立目前版本的接收端與 Download Studio bridge。

快速 Preset 目前刻意鎖定，因此不把未穩定的 Preset recovery 視為正式功能承諾。

## 1.0.5.12 密碼學防偽

1.0.5.12 將原本的 SHA-only 完整性提示升級為**離線私鑰簽署的防偽鎖**。

### 信任模型
- Release package 內含 `integrity-lock.json`，列出所有受保護 package 檔案的 byte size 與 Git-blob identity。
- `integrity-lock.json` 使用 **RSA-3072 / RSASSA-PKCS1-v1_5 / SHA-256** 簽署。
- 擴充只內建公開驗證金鑰；離線 private signing credential 不存放在 GitHub、Release ZIP、diagnostics、Ray_Chen memory 或 GitHub Actions。
- 公開 trust-anchor fingerprint：`c15374dfe729285f9d414053bcc5e04660244716cb1959bceacdd0c4356b7c93`。

### Fail-closed
- Background service worker 先驗證 signed package，驗證 PASS 後才註冊更新檢查、Download capture 等 operational listeners。
- 驗證 pending 或失敗時，Toolbar popup 指向 `TAMPER LOCK` 頁面；Options 與影片頁控制保持鎖定。
- 每分鐘重新檢查套件完整性。
- 任一受保護檔案被修改、缺失、size/hash 不符、簽章失效、版本不符或 public-key fingerprint 不符，都會觸發鎖定。

### Tamper latch / 授權版本
一旦偵測到 tamper，會建立持久 authorization-counter latch。單純把原檔放回去不足以解除；必須安裝由同一離線私鑰合法簽署、且 `authorizationCounter` 高於要求值的新 Build。

未來若要修改受保護檔案，必須由持有者提供離線 AI Change Authorization credential 給執行修改的 AI／工具，再重新簽署新的 manifest。正常更新沿用同一把 signing key；只有 key compromise、撤銷或主動 key rotation 才需要產生新的 authorization credential。

### 安全邊界
Chrome unpacked extension 本質上是本機可修改程式，因此無法數學上阻止攻擊者把 verifier 本身整套刪除。這套機制提供的是：
- pinned public trust anchor；
- official-build cryptographic identity；
- fail-closed tamper detection；
- 沒有離線私鑰就無法產生會被既有 trusted verifier 接受的新官方 Build。

## 更新

Service worker 會定期檢查官方 GitHub Release。有新版時 Toolbar badge 顯示 `UP`；使用者自行下載官方 Release 並重新載入。設定保存在 extension storage。

## 權限

Manifest 1.0.5.12 使用：
- `storage`：設定、Profiles、tamper state／authorization counter、更新資訊。
- `downloads`：輸出媒體檔。
- `scripting`：runtime recovery／補注入。
- `alarms`：更新檢查與防偽週期驗證。
- `webRequest`：觀察 YouTube 實際媒體 request，供 Download Studio resolver 使用。

Host permissions：YouTube、bilibili、Googlevideo 與 GitHub Releases API。

## 安裝

### GitHub Release
1. 前往官方 repository 的 Releases。
2. 下載 `youtube-speed-studio_<version>.zip` 與同名 `.sha256`。
3. 驗證 ZIP SHA-256。
4. 解壓 ZIP。
5. Chrome / Edge 開啟 Extensions 頁面並啟用 Developer mode。
6. 選擇 Load unpacked / 載入未封裝項目，指定含 `manifest.json` 的資料夾。
7. 首次啟動會先進行 signed anti-tamper verification；PASS 後才開放正常 Popup / Options。

## Release 驗證

`main` push 的 GitHub Actions 流程：
1. 解析 `manifest.json` 與 `integrity-lock.json`。
2. 使用 repository 內的**公開金鑰**執行 `scripts/verify_signed_integrity.py`。
3. signed package inventory / signature 驗證 PASS 才允許打包。
4. `scripts/build_release.py` 再次驗證 signed integrity，並拒絕任何 AI authorization credential 或 PEM private key 被打包。
5. 建立 ZIP 與 SHA-256 sidecar。
6. 若同版 tag 尚未存在，建立 immutable `v<version>` GitHub Release。

GitHub Actions **不持有 private signing key**，因此 CI 無法自行重新簽署被修改的 Build。

## License

Copyright © 2026 **Ray20123315**. All rights reserved.

這不是開源授權。官方未修改 Build 僅授權下載、安裝與使用；除必要備份外，任何修改、衍生、重新包裝、鏡像、重新發布、再散布、販售、移除防偽／所有權標示或冒充官方 Build，除非取得 Ray20123315 書面授權，均不在授權範圍內。完整條款見 `LICENSE`，第三方權利見 `THIRD_PARTY_NOTICES.md`。
