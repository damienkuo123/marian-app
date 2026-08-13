# Plan v7.7 — Reward Default + Phase3R.2 Arena Factory

## 目前核心

- PC1 Contact Shell grounding：凍結。
- PC2 Camera Stability Mode 2：凍結。
- Phase3R.1：Shared Alpha11 runtime 已 Build 並切換 `/dev`；legacy Alpha9 shared serving 已刪除。
- `football-field` 是目前唯一 enabled / Alpha11-proven Arena。
- `ferry-deck`、`rooftop-crane`、`low-poly-mega-city-01` 保持 disabled，等待同一 Shared World 內的 Arena Factory reauthor。

## P0 — Reward production default

Reward 不再是 query opt-in feature。Frontend 的正式規則：玩家率先達到 WIN_TARGET、Final 完成、Unity Arena ready → 進 `REWARD_GAMEPLAY`。`rewardZone=0` 僅保留 diagnostics。

## P1 — Phase3R.1 acceptance

以無 reward flag 的正常 URL 驗證：Ready → Intro → Round → Final → Reward → Move/Run/Jump/Orbit → Chest Selection → Exit。寫入 acceptance receipt。

## P2 — Phase3R.2 Arena Factory

回到正確模型：**一個完整 Low Poly Mega City 世界，一個 Shared Alpha11 core，多個 Arena profile**。

對三個 pending Arena：

1. 讀取舊 profile/registry 的位置資料只能作 migration reference，不保留 Alpha9 runtime/ownership。
2. 在完整世界內重新確認 Arena selection / orientation / extents。
3. Author local dedicated collision、Ground Datum、Player/Opponent anchors、Reward sockets、Gameplay zones / Cue anchors。
4. 驗證單一 Motor / CharacterController / camera / reward owner。
5. 驗證 PC1/PC2 canonical bytes 不變。
6. 通過後把 profile 加入同一 Shared Alpha11 runtime registry 並 re-enable。

## P3 — Shared four-profile regression

不是四個 WebGL Build。應以同一 Shared Alpha11 world/runtime 逐一切換 arenaId 驗證四個 profile。

## P4 — Arena Factory productization

將選點、profile authoring、local collision、anchors、reward sockets、validation、manifest/export 收斂成一包式工具，供未來同一世界或新 vendor world 使用。
