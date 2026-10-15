# Hidden Numbers

A self-hosted bundle that keeps a phone base on the owner's own server. Outside the server only
tokens are ever seen; the real number is restored on this server, on the outgoing SIP leg, just
before the call reaches the carrier.

## What runs on the server

| Container | Purpose | Ports |
| --------- | ------- | ----- |
| `hn-cabinet` | web cabinet: upload the base, see results, settings; keeps the keys | 3500/tcp |
| `hn-kamailio` | SIP proxy: swaps the token for the real number on the way to the carrier | 5060/udp, 5060/tcp |
| `hn-rtpengine` | media relay for the calls | 30000–30500/udp |

The images are built from this repository by `.github/workflows/images.yml` and published as
`ghcr.io/otherside-way/hn-*`. Third-party components and their licences are listed in
`bundle/THIRD-PARTY.md`.

## Installing

Installation is done with the one-line command you get together with your install code. It needs
an x86-64 server with a public IPv4 address and Docker. `bundle/doctor.sh` checks a running
installation.

## Tokens

A token is 15 digits in E.164 form: the route digit followed by an FF3-1 ciphertext of the number.

- The same number always gives the same token, so duplicates and do-not-call lists keep working.
- The key never leaves the server, so a token cannot be turned back into the number anywhere else.
- Every token has the same length, whatever the length of the real number (8–13 digits).

## Upload format

CSV or XLSX (UTF-8, first sheet).

| Column | Required | Notes |
| ------ | -------- | ----- |
| `phone_e164` | yes | `+` and country code. Also accepted: `phone`, `number`, `msisdn`. The only column that is tokenised. |
| `external_id` | no | your id; comes back with the results. Defaults to the token. |
| `first_name`, `last_name` | no | |
| `country` | no | ISO 3166-1, e.g. `GB` |
| `language` | no | ISO 639-1, e.g. `en` |
| `segment`, `cohort` | no | how the list is grouped |

Other header names can be mapped with a `header_map` field. Rows with a bad number are reported one
by one and do not stop the upload.

## Development

```bash
bun install
cp .env.example .env && bun run keygen
bun run dev
bun test
```
