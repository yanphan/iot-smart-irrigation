import socket
import sys
import time

def main():
    host = "127.0.0.1"
    port = 4000

    print("==================================================")
    print("  ESP32 Serial Monitor - Smart Irrigation G11   ")
    print("==================================================")
    print(f"Dang ket noi toi Wokwi Simulator qua port {port}...")
    print("Luu y: Hay dam bao da bat mo phong tren Wokwi (F1 -> Wokwi: Start Simulator)\n")

    connected = False
    while True:
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(3.0)
            sock.connect((host, port))
            sock.settimeout(None)
            connected = True
            print("Da ket noi thanh cong! Dang truyen truc tiep logs vi dieu khien:\n" + "-" * 50)

            while True:
                data = sock.recv(1024)
                if not data:
                    print("\n[MONITOR] Ket noi toi simulator bi dong.")
                    break
                # In truc tiep logs thang hang ra terminal khong qua format
                sys.stdout.write(data.decode("utf-8", errors="replace"))
                sys.stdout.flush()

        except (ConnectionRefusedError, socket.timeout, OSError):
            if connected:
                print("\n[MONITOR] Mat ket noi, dang thu lai...")
                connected = False
            time.sleep(1)
        except KeyboardInterrupt:
            print("\n[MONITOR] Da dung theo doi logs.")
            break
        finally:
            try:
                sock.close()
            except Exception:
                pass

if __name__ == "__main__":
    main()
