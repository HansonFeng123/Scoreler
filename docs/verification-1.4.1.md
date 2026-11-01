# 1.4.1 verification

This patch addresses saved-mail recovery, Windows command launching, Notes path validation and application identity. No installer or personal profile is included.

- Twenty-two focused Node tests passed: encrypted mail settings recovery, atomic persistence, disconnect, CLI install/removal/rollback, alias ownership, runtime branding, ICO encoding and shortcut registration.
- Fifteen focused frontend/backend tests passed for Notes containment, packaged-profile mirrors, library features and email UI. The complete production build passed.
- The actual installed `scoreler` command opened the terminal UI and exited cleanly in a native Windows pseudoterminal, from the user home directory, without substituting PATH. CMD and PowerShell help invocation passed. This test uses the installed command rather than a synthetic CLI fixture.
- The running original desktop reported a working CLI connection, ChatGPT and other configured providers, and calendar availability. No AI inference or fresh account authorization was repeated for this patch.
- A local damaged mail settings file was recovered from an encrypted backup. OS decryption was verified without printing the credential. The user confirmed the mail connection returned.
- The Notes library was readable after accepting only exact packaged Windows Roaming mirrors; arbitrary path escapes remain rejected.
- The original application was reopened after a backed-up runtime icon repair. The user confirmed that the external CMD command opens after the physical-path repair. Automated launcher tests alone had missed the packaged-host difference.

The 21-file staged publication review found no personal paths, credential/token patterns, profiles, histories, screenshots or binaries. Diagnostic runtime files and local repairs are excluded. No claim is made that every Windows shell configuration has been tested.
