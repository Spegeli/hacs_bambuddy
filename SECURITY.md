# Security policy

## Reporting a vulnerability

Please report a vulnerability privately, never in a public issue, discussion or pull request:

1. Open [Report a vulnerability](https://github.com/Spegeli/hacs_bambuddy/security/advisories/new) — or the **Security** tab → **Report a vulnerability**.
2. Describe the problem, how to reproduce it and what an attacker could do with it. Name the versions of the integration, of BamBuddy and of Home Assistant.

Never put a real API key into a report. If your key has leaked, delete it in BamBuddy (**Settings → API Keys**) and create a new one.

Only you and the maintainer see the report. This is a personal project, maintained in spare time: you get an answer as soon as possible, but there is no fixed response time. The advisory is published together with the release that fixes the vulnerability, and you are credited unless you ask not to be.

Not sure whether it is a vulnerability? Report it privately anyway.

## Scope

In scope is the code in this repository, in particular:

- how the integration stores and uses your BamBuddy API key and the camera's stream token, and that it keeps both out of logs and error messages
- the requests to your BamBuddy server, including the printer commands it sends: pause, resume, stop, print speed, chamber light, clearing HMS errors and clearing the plate
- the workflows that check and publish releases

Vulnerabilities in BamBuddy itself, in Bambu Lab's printers, firmware or cloud, in Home Assistant or in HACS are out of scope: report them to BamBuddy (see its [security policy](https://github.com/maziggy/bambuddy/blob/main/SECURITY.md)), to Bambu Lab, to [Home Assistant](https://www.home-assistant.io/security/) or to the HACS project.

## Supported versions

Only the latest release receives security fixes. Update through HACS.

| Version | Security fixes |
|---|---|
| Latest release | ✅ |
| Older releases | ❌ |
