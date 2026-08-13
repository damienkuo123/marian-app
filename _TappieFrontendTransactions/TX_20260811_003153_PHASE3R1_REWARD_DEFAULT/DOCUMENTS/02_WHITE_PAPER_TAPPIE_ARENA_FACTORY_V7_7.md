# White Paper v7.7 — Canonical Shared World, Arena Profiles, Reward as Product Flow

Tappie Challenge 的重量級資產是完整 3D 世界，不是單一 Arena。Arena 是世界內被選定的玩法區域與資料 profile。產品必須避免每個 Arena 複製一套角色控制、鏡頭、Reward owner 或 WebGL runtime。

正式核心由 Alpha11 提供：單一 PhysicsRoot、單一 CharacterController、單一 Motor、每幀最多一個 `CharacterController.Move()`、dedicated collision、PC1 Contact Shell、Independent Orbit 與 PC2 Comfort Anti-Pumping Camera。Challenge 的 Ready / Intro / Round / Final / Reward 只是狀態與演出層，不得重新擁有 movement、grounding 或 camera。

Reward 已由實驗功能升格為產品標準流程。此前 `rewardZone=1` 僅是驗證 Reward 是否值得保留的 feature gate；產品決策確立後，正式勝利流程不應依賴使用者或 Dashboard 附加 query 參數。Reward 應在玩家勝利且 runtime ready 時自然銜接 Final；query 僅可提供 diagnostics opt-out，而不可作正式 feature enable。

Shared Multi-Arena 的 canonical topology：

```text
Low Poly Mega City Full World
        │
        ├── Shared Alpha11 Core
        │   ├── PC1 Contact Shell Motor
        │   ├── PC2 Mode 2 Camera
        │   ├── Challenge Flow
        │   └── Reward Gameplay
        │
        └── Arena Profile Registry
            ├── football-field
            ├── ferry-deck
            ├── rooftop-crane
            └── low-poly-mega-city-01
```

每個 Arena profile 可有自己的中心、方向、Player/Opponent anchor、Reward sockets、Gameplay zones、Ground Datum 與 local dedicated collision，但不得產生第二套 gameplay core。未通過 Alpha11 authoring / validation 的 profile 必須 disabled，不能 fallback 到 Alpha9。
