---
description: Explain direct extension-owned Flow PR publication.
argument-hint: "[instructions]"
---

This prompt template is not the Flow PR publication boundary. The package extension registers `/flow-pr` as a command. It prepares and finalizes through the existing runtime, presents the finalized approval summary through one native confirmation, then executes at most once on affirmative approval.

This template does not publish by delegation. Explain that delegated publication is mechanically disabled for safety, and ask the user to invoke `/flow-pr $ARGUMENTS` in interactive Pi TUI to review and confirm one PR publication.
