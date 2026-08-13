# Failure Record Addition — Reward Feature Gate

- Reward was initially guarded by `params.get('rewardZone') === '1'` while the team evaluated whether Reward should ship.
- After Reward was accepted as a product requirement, leaving that gate in place caused a normal Phase3R.1 review URL to end at the success sheet instead of entering Reward Gameplay.
- Do not interpret this as a Unity/PC1/PC2 failure.
- Do not fix it by adding `rewardZone=1` to every production URL. That would preserve the obsolete experiment contract.
- Correct production behavior is default-on Reward with optional explicit diagnostics opt-out only.
- Do not alter WebGL runtime, Motor, Camera, Reward ownership or state coordinator for this frontend activation issue.
