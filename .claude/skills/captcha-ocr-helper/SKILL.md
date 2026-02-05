---
name: captcha-ocr-helper
description: Assists in developing and debugging Go Tesseract OCR for CAPTCHAs. Use this when the user asks about OCR accuracy, image preprocessing, or Tesseract configuration.
---

# Captcha OCR Helper

當使用者需要開發或優化驗證碼識別時，請遵循以下專家流程建議：

## 1. 圖像預處理檢查 (Image Preprocessing Checklist)
OCR 的準確率 80% 取決於圖片處理。請建議使用者實作以下步驟：
- **灰階化 (Grayscale)**: 移除色彩干擾。
- **二值化 (Binarization)**: 使用 Thresholding 將圖片轉為只有黑白，去除噪點。
- **放大 (Upscaling)**: 驗證碼通常很小，建議放大 200% - 300% 以利 Tesseract 識別。
- **去噪 (Denoising)**: 使用高斯模糊或中值濾波移除背景雜點。

## 2. Tesseract 配置優化
- **Whitelist**: 限制識別字元 (例如只識別數字 `0-9`)。
- **PSM (Page Segmentation Mode)**: 驗證碼通常是單行文字，建議設定為 `7` (Treat the image as a single text line) 或 `8` (Single word)。

## 3. 驗證與檢查機制
- **字數檢查**: 識別結果長度是否符合預期？
- **信心度檢查 (Confidence Score)**: 如果平均信心度低於 70%，應標記為失敗並重試或記錄圖片以供訓練。