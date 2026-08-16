# Security Policy

Security and privacy are important to SubUTF8, especially because the application processes user-provided subtitle files in the browser.

## Supported version

Security fixes target the latest version of the `main` branch and the current public deployment at:

- https://srt.alexlab.media

Older snapshots, forks, modified builds, and third-party deployments are not supported by this policy.

## Reporting a vulnerability

Please report security issues responsibly.

If GitHub's private vulnerability reporting option is available for this repository, use **Security → Report a vulnerability**.

If private reporting is not available, do not publish exploit details, private data, tokens, or a proof of concept in a public issue. Instead, open a short issue stating that you would like to report a security problem privately, without including sensitive technical details.

A useful report should include:

- the affected feature or file;
- the browser / operating system where the issue was reproduced;
- clear reproduction steps;
- the potential security or privacy impact;
- a suggested fix, if known.

## Privacy model

SubUTF8 is designed so that subtitle conversion happens locally on the user's device. The application does not require a project-owned subtitle upload API for conversion.

A security issue that causes subtitle contents to leave the device unexpectedly, executes untrusted subtitle content as code, bypasses the intended browser security model, or otherwise exposes user data should be treated as security-sensitive.

## Scope

Examples of issues that are in scope include:

- cross-site scripting or code execution caused by crafted subtitle content;
- unexpected network transmission of subtitle contents;
- unsafe handling of uploaded files;
- vulnerabilities in the public PWA that could compromise user data;
- dependency vulnerabilities that are exploitable in SubUTF8.

General feature requests, encoding-detection improvements, browser compatibility problems, and ordinary conversion bugs can be reported through normal GitHub issues.

## Responsible disclosure

Please allow reasonable time for investigation and a fix before publicly disclosing a security-sensitive vulnerability.

Thank you for helping keep SubUTF8 safe.
