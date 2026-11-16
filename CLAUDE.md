# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ESP32 smart-irrigation firmware (school project, team G11) for 3 slope zones: Z1 hilltop, Z2 hillside, Z3 valley/low-lying. It postpones watering when rain is forecast (Open-Meteo), pumps water out of Z3 on flood, and falls back to soil-only control when the weather data is unavailable. The approach is "simulate first, hardware later": everything runs on the Wokwi simulator today (`CURRENT_MODE MODE_SIM`). Code comments, logs and commit messages are in Vietnamese, mostly without diacritics.

## Commands

- Build firmware: `pio run` (single env `esp32dev`; this is the default VS Code build task)
- Run simulation: build first, then in VS Code run "Wokwi: Start Simulator". It loads `.pio/build/esp32dev/firmware.elf` via [wokwi.toml](wokwi.toml), with the circuit in [diagram.json](diagram.json)
- Simulator serial logs: `python monitor.py` (connects to the Wokwi serial port on TCP 127.0.0.1:4000). On real hardware, use `pio device monitor` (115200 baud)
- Web dashboard "IrrigVista" (the current monitoring UI): open [dashboard/index.html](dashboard/index.html) as a static page. There is no build step. It talks to the broker over WSS `broker.emqx.io:8084/mqtt` and calls Open-Meteo directly from the browser
- Offline hydrology model + strategy comparison S-A/S-B/S-C/S-D (report chapter 4): `pip install -r sim/requirements.txt` then `python sim/hydrology.py`. Writes `sim/output/ket_qua.csv` and one PNG per weather scenario (git-ignored). Its `decide()` is a hand port of [src/decide.cpp](src/decide.cpp) and its thresholds mirror `config.h`, so when you change either, update [sim/hydrology.py](sim/hydrology.py) too
- Node-RED flow ([flow_node-red.json](flow_node-red.json)) is legacy and no longer used; the team replaced it with the HTML dashboard

**Tests:** there is no `pio test` setup ([test/](test/) is empty). The unit tests for `decide()` are in [src/test_decide.cpp](src/test_decide.cpp). `runAllDecideTests()` runs them at boot from `setup()` and uses `assert()`, so a failing test aborts at startup. To add a test, write a `static void test_XX_...()` function and call it from `runAllDecideTests()`. The test IDs (A1–A3, B1–B3, C1–C2, D1–D8) match the test-case tables in the team's report. Running a single test means commenting out the other calls.

## Architecture

**Central config.** All GPIO pins, moisture thresholds, timings, MQTT broker, Wi-Fi and location are defined in [include/config.h](include/config.h). Don't hardcode values in `.cpp` files. Timing constants change with `CURRENT_MODE`: SIM uses a short demo `SOAK_WAIT_TIME` (7 s) and HW uses 120 s.

**SIM/HW switch at compile time.** The interfaces are abstract classes in `include/` (`SoilSensor`, `PumpRelay`, `Weather`), each exposed through a global pointer (`soilSensor`, `pumpRelay`, `weatherService`). Each implementation file wraps its whole body in `#if CURRENT_MODE == MODE_SIM` (`sim_*.cpp`) or `MODE_HW` (`hw_*.cpp`) and defines the global pointer. Only `hw_weather.cpp` exists so far: `hw_soil_sensor.cpp` and `hw_pump_relay.cpp` haven't been written, so switching to `MODE_HW` won't link yet.

**SIM modules do more than stub the hardware:**
- `sim_soil_sensor.cpp` simulates slope water physics. Moisture rises while a zone's pump is on, runoff seeps down to the zones below, Z3 drains through relay 4, and rain soaks into the soil. If the user turns a Wokwi potentiometer by more than 250 ADC counts, that reading overrides the simulated value.
- `sim_weather.cpp` fetches real Open-Meteo data over HTTP by default. When a scenario JSON arrives on `g11/irrig/sim/weather` (rain scenarios W0, W1, ...), it switches to that preset (`isPresetActive`) and stops the API from overwriting it.

**FreeRTOS on two cores** ([src/main.cpp](src/main.cpp)). `loop()` deletes itself.
- `taskNetwork`, Core 0: runs `mqttLoop()`, refreshes the weather every 60 s, and publishes telemetry.
- `taskControl`, Core 1: runs every `SENSOR_READ_INTERVAL` (1.5 s in SIM). Each cycle reads the sensors, applies injected faults and the pump-timeout watchdog, builds a `DecideInput`, calls `decide()`, and carries out the returned `DecideCommand` (relays, soak timer, MQTT state and alerts). Alerts are de-duplicated so the same one isn't re-sent every cycle.
- The two tasks share data through `static volatile` globals, with no mutexes.

**Pure decision function.** `decide()` in [src/decide.cpp](src/decide.cpp) is the core logic. It must stay pure: no `Serial`, `digitalWrite`, `delay`, or hardware or global access. It only maps `DecideInput` to `DecideCommand`. The "state machine" ([state_machine.h](include/state_machine.h), states S0–S9 plus S99_SAFE) is mostly the `SystemState` enum and the string helpers `stateToCode`/`stateToDescription`. `main.cpp` always passes `S1_MONITOR` as the current state and doesn't keep FSM state between cycles: the next state is recomputed every time, and the only persistent timers are `soakWaitUntil` and `pulseStartTime`. Relay 4 (GPIO 33) is the Z3 drain pump used in `S5_DRAIN`, not a spare.

**MQTT contract** (prefix `g11/irrig/`). This contract is shared by the firmware ([src/mqtt_client.cpp](src/mqtt_client.cpp)) and the web dashboard ([dashboard/js/config.js](dashboard/js/config.js)). If you change a topic or payload, update both.
- Telemetry published by the firmware: `z{1,2,3}/soil`, `env`, `state`, `pump`, `weather`, `alert`, plus `status` (LWT `offline`)
- Commands and scenario injection the firmware subscribes to: `cmd/mode`, `cmd/pump`, `cmd/threshold` (Z1 only), `sim/weather`, `sim/fault` (`D1_SOIL_FAIL`, `D2_PUMP_JAM`, `CLEAR_FAULT`/`RESET`), `sim/soil`

## Hard rules (from README "Definition of Done")

- Relays are active LOW. Write `HIGH` (off) **before** `pinMode(..., OUTPUT)`. Avoid strapping pins 0, 2, 12 and 15.
- Soil sensors must use ADC1 pins only (36, 39, 34). ADC2 conflicts with Wi-Fi.
- Git flow: branch `feature/...` off `develop` and open the PR into `develop`. `main` only receives merges from `develop`. Use Conventional Commit prefixes (`feat:`, `fix:`, `refactor:`).
- `.clangd` strips Xtensa-only GCC flags (`-mlongcalls` etc.) so clangd works. The README troubleshooting table suggests raising the task stack to 8192 when you hit a stack-overflow Guru Meditation; it's already 8192.
