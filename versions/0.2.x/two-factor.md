---
title: "Two-Factor Authentication"
description: "Adding a second sign-in step with an authenticator app, recovery codes or a passkey."
---

Two-factor authentication is the `twoFactor` switch in `config/auth.ts` (on by default in the installer's question 6). Users turn it on in two steps (get a secret, then confirm with a 6-digit code), so nobody locks themselves out, and they receive 10 single-use recovery codes, shown once. Each authenticator code works only once, "remember this device" skips the code for 30 days on one browser, and the secret is stored encrypted. A passkey also answers the second step. Turning it on or off needs a recent password confirmation.

The [Authentication](../authentication/) page already covers the whole flow, with requests and responses. It is proven in the auth prototype (spike 20) and not released yet.

:::note[Being written]
This page is being written for 0.2. The summary above is accurate; the step-by-step guide with examples is on its way. Until then, the [Authentication](../authentication/) page has the full flow.
:::
