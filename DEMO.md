# Kịch bản demo hệ thống tưới thông minh (Nhóm G11)

Thời lượng: khoảng 7–8 phút. Gồm 5 phần: tưới tuần tự, hoãn tưới vì mưa, tiêu úng, mất dự báo, lỗi cảm biến.

Quy ước: **[Bấm]** là thao tác trên dashboard, **[Thấy]** là những gì phải xuất hiện, **[Nói]** là ý chính để thuyết trình.

---

## 0. Chuẩn bị (làm trước khi lên trình bày)

1. Build firmware: `pio run` (hoặc task Build mặc định của VS Code).
2. Chạy Wokwi: `Ctrl+Shift+P` → **Wokwi: Start Simulator**.
3. Mở terminal, chạy `python monitor.py` để xem log serial.
4. Mở `dashboard/index.html` trên trình duyệt.
5. Kiểm tra trước khi bắt đầu:
   - Dashboard báo thiết bị **Online**, số độ ẩm ba vùng có cập nhật.
   - Log serial có dòng `18/18 TEST CASES PASSED` (có thể chỉ cho hội đồng xem ngay đầu buổi).
   - Chế độ đang là **AUTO**.
6. Bấm **RESET** một lần để xóa lỗi hay cảnh báo còn sót từ lần chạy trước.

Sắp xếp màn hình: dashboard chiếm phần lớn, cửa sổ log serial nhỏ bên cạnh để chứng minh lệnh là do ESP32 xử lý.

---

## 1. W0 – Tưới tuần tự theo địa hình (~1,5 phút)

**[Bấm]** Kịch bản → **W0 Nắng ráo**.

**[Thấy]**
- Độ ẩm bị đặt về Z1 = 28%, Z2 = 30%, Z3 = 28%.
- Trạng thái S2 (đối chiếu dự báo) trong khoảng 1,5 s, sau đó chuyển S4, **bơm Z1 bật**, có thông báo AUTO_IRRIG.
- Z1 tăng khoảng 3,5%/s. Nước thấm xuống làm Z2, Z3 cũng tăng nhẹ.

**[Nói]** "Đất khô, không có mưa nên hệ thống tưới, bắt đầu từ vùng cao vì nước sẽ thấm xuống vùng dưới."

**[Chờ]** Cho W0 chạy hết, khoảng 40 s: Z1 bơm (~9 s) → chờ ngấm 7 s → Z2 bơm (~8 s) → chờ ngấm 7 s → Z3 bơm (~6 s) → về S1. Mỗi lần một vùng bật bơm sẽ có một thông báo AUTO_IRRIG.

**[Nói]** trong lúc chờ ngấm (S9): "Giữa hai vùng, hệ thống nghỉ để nước kịp thấm xuống. Nhờ vậy Z2, Z3 đã được làm ẩm một phần trước khi tới lượt, nên cần bơm ít hơn."

---

## 2. W1 – Hoãn tưới vì dự báo mưa (~1 phút)

Lúc này cả ba vùng đã đủ ẩm. Nếu bấm W1 ngay thì không thấy gì thay đổi, vì không có bơm nào đang chạy để ngắt. Không cần RESET (RESET chỉ xóa lỗi, không làm khô đất).

**[Bấm]** **W0** lần nữa để đất khô lại. Khoảng 2–4 giây sau khi bơm Z1 bật (lúc Z1 khoảng 35–45%), chọn **W1 Mưa dông lớn**.

**[Thấy]**
- Trong vòng ≤ 1,5 s, **bơm Z1 tắt** giữa chừng.
- Trạng thái chuyển **S3 "Tạm hoãn tưới (Đón mưa)"**, có thông báo RAIN_DELAY.
- Độ ẩm ba vùng vẫn tăng chậm nhờ mưa mô phỏng (khoảng 1,2%/s ở Z1), rồi dừng ở khoảng 62 / 65 / 68%.

**[Nói]** "Giả sử dự báo vài giờ tới có mưa lớn. Đất đang khô nhưng hệ thống ngắt bơm, để nước mưa tưới thay, tiết kiệm nước."

> ℹ️ Thẻ thời tiết trên dashboard luôn hiện dữ liệu Open-Meteo thật của Cầu Đất. Kịch bản W chỉ gửi dữ liệu dự báo giả lập xuống ESP32 (hiện ở dòng trạng thái mưa và cột mưa trên biểu đồ). Vì vậy thẻ thời tiết có thể đang báo nắng trong khi hệ thống hoãn tưới. Nếu hội đồng hỏi, giải thích đây là dữ liệu tiêm vào để chủ động tạo tình huống.

> ⚠️ Nếu bấm W1 đúng lúc hệ thống đang chờ ngấm (S9, 7 s giữa hai vùng), bơm vẫn tắt nhưng phải hết thời gian chờ mới thấy chuyển sang S3. Cứ đợi vài giây.
> Không cần chờ hết thời gian hoãn tối đa (120 s).

---

## 3. W3 – Mưa cực lớn, tiêu úng vùng trũng (~1,5 phút)

**[Bấm]** **W3 Mưa cực lớn**.

**[Thấy]**
- Z3 tăng nhanh. Khi Z3 ≥ 80%, trạng thái chuyển **S5 "Đang xả tràn tiêu úng"**, **bơm tiêu úng (relay 4) bật**, có thông báo FLOOD_WARNING.
- Van tưới Z3 bị khóa.
- Z3 dao động quanh 88–94% dù bơm tiêu đang chạy.

**[Nói]** "Z3 là vùng trũng nên ngập trước. Hệ thống khóa van tưới Z3 và bật bơm tiêu. Mưa quá lớn nên bơm chỉ giữ được mức ngập, chưa kéo xuống được."

**[Bấm]** Sau khoảng 15–20 s, chọn **W5 Dự báo sai (Hết mưa)**.

**[Thấy]**
- Mưa mô phỏng dừng, Z3 giảm khoảng 5%/s.
- Khi Z3 < 80%, **bơm tiêu tự tắt**, trạng thái về **S1 "Đang giám sát tự động"**.

**[Nói]** "Hết mưa, bơm tiêu kéo Z3 về dưới ngưỡng ngập rồi tự tắt, không cần người can thiệp."

---

## 4. D3 → D4 – Mất dữ liệu dự báo (~1 phút)

**[Bấm]** Sự cố → **D3 Mất kết nối mạng**.

**[Thấy]**
- Trạng thái chuyển **S8 "Vận hành tự trị độc lập"** (lý do: "Mất dự báo, tưới theo cảm biến"), vì lúc này các vùng đều đủ ẩm.
- Log serial có dòng `D3_NET_LOST`.

**[Nói]** "Khi mất dự báo thời tiết, hệ thống không dừng hẳn mà chuyển sang chỉ dựa vào cảm biến độ ẩm. Nếu có vùng khô, nó vẫn tưới bình thường."

**[Bấm]** **D4 Có mạng lại**.

**[Thấy]** Trạng thái về **S1**, log có `D4_NET_RESTORE`.

---

## 5. D1 → RESET – Lỗi cảm biến và trạng thái an toàn (~1 phút)

**[Bấm]** **D1 Đứt dây cảm biến**.

**[Thấy]**
- Trạng thái **S99 "Ngắt an toàn khẩn cấp"**, **tắt toàn bộ bơm**, có thông báo SENSOR_RANGE.

**[Nói]** "Khi cảm biến hỏng, số đo không còn tin được. Hệ thống tắt mọi bơm và chờ người vận hành kiểm tra, tránh tưới mù gây ngập."

**[Bấm]** **RESET**.

**[Thấy]** Thông báo xanh "Hệ thống đã phục hồi" (SYSTEM_NORMAL), trạng thái về S1.

---

## 6. (Tùy chọn, nếu còn thời gian) Điều khiển thủ công

**[Bấm]** Chuyển chế độ sang **MANUAL**, bật bơm Z1 bằng tay, rồi tắt.

**[Nói]** "Người vận hành có thể điều khiển tay. Chế độ thủ công tự hết hạn sau 10 phút và quay về AUTO, để không có bơm nào bị bỏ quên."

---

## Xử lý khi demo bị trục trặc

| Hiện tượng | Cách xử lý |
|---|---|
| Bấm kịch bản mà không có gì thay đổi | Xem log serial có nhận lệnh không. Nếu có, bấm **RESET** rồi chạy lại kịch bản. |
| Trạng thái kẹt ở S99 hoặc S7 | Một lỗi cũ chưa được xóa. Bấm **RESET**. |
| Dashboard báo Offline, số liệu đứng yên | Kiểm tra Wokwi còn chạy không; tải lại trang dashboard (broker công cộng đôi khi chậm vài giây). |
| W1 không thấy bơm bị ngắt | Đất đã ẩm từ trước nên không có bơm nào để ngắt. Bấm **W0**, đợi bơm Z1 bật rồi bấm lại **W1**. |
| Z3 không xuống dưới 80% ở phần 3 | Kịch bản W3 vẫn còn hiệu lực. Bấm **W5** để dừng mưa. |
| Muốn làm lại từ đầu | **RESET** → **W0**. |

## Câu hỏi hội đồng có thể hỏi

- **Vì sao bơm tiêu chạy mà Z3 vẫn tăng?** Mô phỏng cố ý cho mưa cực lớn vào Z3 (5,25%/s) nhanh hơn tốc độ bơm tiêu rút ra (5%/s), giống thực tế khi bơm không đủ công suất. Bơm chỉ giữ cho mức ngập không tăng mãi.
- **Vùng khô có cảnh báo không?** Không. Đất khô nhưng còn trên 25% được coi là vận hành bình thường; hệ thống chỉ báo AUTO_IRRIG khi bắt đầu tưới.
- **Số liệu có phải đo thật không?** Không. Độ ẩm do firmware mô phỏng trên Wokwi. Dự báo thời tiết mặc định lấy thật từ Open-Meteo, còn khi demo thì dùng kịch bản tiêm vào để chủ động điều kiện.
- **Nếu dự báo sai, mưa không đến thì sao?** Sau 120 s hoãn mà vẫn còn vùng khô, hệ thống bỏ hoãn và tưới lại theo cảm biến (Tdelay_max).
