# Architecture Lock v3.7

1. One canonical Alpha11 gameplay core per world family.
2. Arena = selected region/profile/data inside the full world; Arena != independent gameplay core.
3. Legacy Alpha9 shared production serving is retired after Phase3R.1; no hidden fallback.
4. PC1 Contact Shell invariant remains `controller.center.y = controller.height / 2 + controller.skinWidth`.
5. PC2 Camera Mode 2 remains canonical; Mode 3 is not production.
6. Reward is now standard player-win product flow; no `rewardZone=1` requirement.
7. `rewardZone=0` is diagnostics-only explicit opt-out.
8. Reward may not own a second Motor, CharacterController, camera, grounding or PhysicsRoot.
9. Accepted Source Scene is immutable; deployment/manufacturing changes go to generated copies/tools.
10. Pending Arena profiles remain disabled until Arena Factory proves local collision + anchors + sockets + capability ownership.
11. One Shared WebGL runtime is preferred for the world family; do not return to one-build-per-Arena topology.
12. No Git/backend/Supabase mutation without explicit user authorization.
