# KỊCH BẢN THUYẾT TRÌNH VÀ DEMO HỆ THỐNG
## Dự án: Hệ Thống Tưới Thông Minh Đồi Dốc (Nhóm G11)

- **Thời lượng:** Khoảng 4 – 5 phút.
- **Phong cách:** Ngắn gọn, dễ hiểu, nói đến đâu bấm chuột đến đó.
- **Quy ước:**
  - **[Bấm]:** Thao tác chuột bạn cần làm trên màn hình.
  - **[Thấy]:** Những gì giao diện web sẽ thay đổi (để bạn chỉ vào màn hình).
  - **[Nói]:** Lời thoại trực tiếp để bạn đọc cho thầy cô nghe.

---

### BƯỚC 0: CHUẨN BỊ (Làm trước khi bắt đầu)
1. Mở file `diagram.json` trong VS Code $\rightarrow$ bấm nút **Play ▶️** (màu xanh lá) để bật mô phỏng ESP32.
2. Mở trình duyệt web `http://localhost:3000` $\rightarrow$ nhìn góc trên bên phải thấy báo **`ESP32: Online`**.
3. Bấm menu *Kịch Bản Kiểm Thử* $\rightarrow$ chọn **`RESET`** một lần cho sạch trạng thái cũ.

---

### 1. MỞ ĐẦU: GIỚI THIỆU HỆ THỐNG (~30 giây)

* **[Bấm]:** Rê chuột chỉ từ trên xuống dưới màn hình (Topbar $\rightarrow$ Bản đồ 3 tầng $\rightarrow$ Các ô thông số).
* **[Nói]:**
  > *"Em xin kính chào Thầy/Cô. Đây là giao diện điều khiển của hệ thống tưới thông minh cho vùng đồi dốc tại Cầu Đất - Đà Lạt.*  
  > 
  > *Toàn bộ hoạt động do chip ESP32 xử lý và gửi dữ liệu lên trang web này qua mạng.*  
  > 
  > *Ở giữa màn hình là bản đồ khu vườn chia làm 3 tầng: Tầng 1 trên đỉnh đồi, Tầng 2 ở sườn dốc và Tầng 3 ở dưới chân đồi. Mỗi tầng đều có cảm biến đo độ ẩm đất và các van bơm nước riêng.*  
  > 
  > *Sau đây em xin demo từng tính năng của hệ thống."*

---

### 2. DEMO 1: TƯỚI THEO THỨ TỰ TỪ TRÊN XUỐNG DƯỚI (~1 phút)

* **[Bấm]:** Menu *Kịch Bản Kiểm Thử* $\rightarrow$ chọn **W0 Nắng Ráo**.
* **[Thấy]:** 
  - Bơm tầng 1 bật màu xanh (`ON`), độ ẩm tầng 1 tăng dần.
  - Khi đủ 60% thì bơm tầng 1 tắt $\rightarrow$ web báo `S9 - Chờ nước ngấm` (đếm lùi 7 giây) $\rightarrow$ sau đó bơm tầng 2 tự bật lên.
* **[Nói]:**
  > *"Trước tiên là lúc trời nắng đất khô, em bấm kịch bản **W0**.*  
  > 
  > *Vì ở trên đồi nước luôn chảy từ trên cao xuống thấp, nên hệ thống sẽ **bật bơm tưới tầng 1 trên đỉnh trước** như Thầy/Cô đang thấy trên bản đồ.*  
  > 
  > *Khi tầng 1 đủ nước, bơm sẽ tắt và hệ thống dừng lại nghỉ 7 giây. Lúc này nước từ trên đỉnh sẽ tự ngấm dần xuống sườn đồi. Nhờ vậy tầng 2 đã ẩm sẵn một phần trước khi bơm, giúp tiết kiệm nước và tiền điện."*

---

### 3. DEMO 2: GẶP MƯA TỰ TẮT BƠM & ĐẤT KHÔ THÌ CỨU CÂY NGAY (~1 phút)

#### a) Trời sắp mưa to thì hoãn tưới:
* **[Bấm]:** Bấm lại **W0** cho bơm tầng 1 chạy lại $\rightarrow$ khi bơm đang chạy, bấm ngay **W1 Mưa Dông Lớn**.
* **[Thấy]:** Bơm tầng 1 đang chạy lập tức tắt ngay, cột mưa vọt lên, web chuyển sang báo `Tạm hoãn tưới (Đón mưa)`.
* **[Nói]:**
  > *"Tính năng thứ hai là tự động theo dõi thời tiết. Nếu hệ thống đang tưới mà trạm dự báo thấy sắp có mưa to, ví dụ ở kịch bản **W1** này: Bơm sẽ tự ngắt ngay để chờ nước mưa tưới giúp, không tốn nước của mình."*

#### b) Đất quá khô cằn thì ưu tiên cứu cây:
* **[Bấm]:** Bấm tiếp kịch bản **W4 Hạn Kiệt Vùng Cao**.
* **[Thấy]:** Cột mưa vẫn báo có mưa, nhưng đất tầng 1 bị khô kiệt xuống 20% (báo đỏ) $\rightarrow$ Bơm tầng 1 tự bật lên tưới ngay!
* **[Nói]:**
  > *"Nhưng nếu đất trên đỉnh đồi bị khô hạn nặng dưới 25% như ở kịch bản **W4**: Cây sắp chết khô nên hệ thống sẽ không chờ mưa nữa, mà **bật bơm tưới ngay lập tức để cứu cây**, tránh làm chết hoa màu."*

---

### 4. DEMO 3: CHỐNG NGẬP ÚNG VÙNG CHÂN ĐỒI (~45 giây)

* **[Bấm]:** Bấm **W3 Mưa Cực Lớn** $\rightarrow$ đợi 5 giây $\rightarrow$ bấm **W5 Dự Báo Sai (Tạnh Mưa)**.
* **[Thấy]:** Đất chân đồi tầng 3 tăng vượt 80% $\rightarrow$ Bơm xả úng (Relay 4) tự bật màu đỏ, khóa van tưới. Khi bấm W5, nước rút xuống dưới 80% thì bơm xả tự tắt.
* **[Nói]:**
  > *"Dưới chân đồi là nơi nước dồn về nhiều nhất nên rất dễ bị ngập làm thối rễ.*  
  > 
  > *Khi mưa lớn làm độ ẩm chân đồi vượt 80%, hệ thống tự bật **Bơm xả tràn** để hút nước ra ngoài và khóa van tưới lại.*  
  > 
  > *Khi mưa tạnh và nước rút về mức an toàn, bơm xả sẽ **tự động tắt**, người nông dân không cần phải tự đi canh."*

---

### 5. DEMO 4: AN TOÀN KHI HỎNG HÓC VÀ MẤT MẠNG (~1 phút)

#### a) Đứt dây cảm biến:
* **[Bấm]:** Bấm **W0** cho bơm chạy $\rightarrow$ bấm ngay **D1 Đứt Dây Cảm Biến** $\rightarrow$ rồi bấm **RESET**.
* **[Thấy]:** Bơm ngắt ngay, web báo động đỏ `S99 - Ngắt an toàn`. Bấm RESET thì trở lại màu xanh bình thường.
* **[Nói]:**
  > *"Về độ an toàn: Nếu cảm biến bị chuột cắn đứt dây hoặc bị hỏng, hệ thống sẽ ngắt hết các bơm ngay lập tức để tránh tình trạng đo sai rồi tưới ngập vườn.*  
  > *Kiểm tra xong, người dùng chỉ cần bấm **RESET** là máy hoạt động lại bình thường."*

#### b) Mất mạng Internet & Điều khiển bằng tay:
* **[Bấm]:** Bấm **D3 Mất Mạng** $\rightarrow$ rồi bấm nút trên cùng chuyển sang chế độ **`MANUAL`** $\rightarrow$ bấm thử 1 công tắc bơm.
* **[Thấy]:** Web báo `S8 - Tự trị (Mất mạng)`. Ở chế độ MANUAL, người dùng có thể tự bật/tắt từng bơm.
* **[Nói]:**
  > *"Nếu bị rớt mạng Internet, máy vẫn tiếp tục tự động đo cảm biến để tưới bình thường chứ không bị đơ.*  
  > 
  > *Khi cần, người dùng có thể chuyển sang chế độ **MANUAL** để tự bật tắt từng bơm bằng tay. Chế độ này có cài tự ngắt sau 10 phút, phòng trường hợp người dùng bật bơm rồi quên không tắt."*

---

### 6. KẾT LUẬN (~15 giây)

* **[Nói]:**
  > *"Tóm lại, hệ thống giúp: Tưới đúng cách theo đồi dốc, biết hoãn tưới khi trời mưa để đỡ tốn nước, và tự bảo vệ an toàn khi có sự cố.*  
  > 
  > *Em xin cảm ơn Thầy/Cô đã lắng nghe và em xin mời Thầy/Cô đặt câu hỏi ạ."*
