# Third-party notices

MyBody365 ships the following third-party works. Their licences require these notices.

## Icons: Lucide

The interface icons (`frontend/src/app/shared/icon.component.ts`) are drawn after [Lucide](https://lucide.dev).

```
ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT).
All other copyright (c) for Lucide are held by Lucide Contributors 2022.

Permission to use, copy, modify, and/or distribute this software for any purpose with or without
fee is hereby granted, provided that the above copyright notice and this permission notice appear
in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS
SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE
AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT,
NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.
```

```
The MIT License (MIT) — Feather

Copyright (c) 2013-2023 Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES
OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## Fonts

| Font | Copyright | Licence | Use |
|---|---|---|---|
| Inter | © 2016 The Inter Project Authors (Rasmus Andersson) | SIL Open Font License 1.1 | interface text, latin subset (via Fontsource) |
| Archivo | © 2017 The Archivo Project Authors (Omnibus-Type) | SIL Open Font License 1.1 | titles and numbers, trimmed by `frontend/scripts/fonts.mjs` (latin, weight 600-900, width 100-125 %) |

The SIL Open Font License 1.1 allows using, modifying and redistributing the fonts, including in
web pages, as long as they are not sold on their own and modified versions stay under the same
licence. Full text: https://openfontlicense.org/open-font-license-official-text/

## Libraries shipped in the app

The app bundles these libraries (loaded only on the screens that use them). Their licences ship with their
packages in `node_modules`; the notices below are the ones they require.

- **ZXing** (`@zxing/library`, barcode and QR code reading): Apache License 2.0, © ZXing authors.
  <https://github.com/zxing-js/library>. `@zxing/browser`: MIT License, © ZXing authors.
- **node-qrcode** (`qrcode`, invitation QR codes): MIT License, © 2012 Ryan Day. Its dependency **dijkstrajs**:
  MIT License, © 2008 Tom Carden.

The server uses (Maven, licences in their jars):

- **AWS SDK for Java 2.x** (object storage client): Apache License 2.0, © Amazon.com, Inc. or its affiliates.
- **TwelveMonkeys ImageIO** (WebP and JPEG decoding): BSD 3-Clause License, © Harald Kuhr.
- Spring Boot, Spring Security, Hibernate, Flyway, the PostgreSQL JDBC driver: Apache License 2.0 / BSD.
- **cwebp** (libwebp tools, installed in the server image): BSD 3-Clause License, © Google Inc.

## Data

- **Open Food Facts**: the database is available under the Open Database License (ODbL) 1.0, its contents under the
  Database Contents License 1.0, © Open Food Facts contributors (<https://world.openfoodfacts.org>). Products found
  are cached by the server; no personal data is ever sent to Open Food Facts.
- **Ciqual**, French food composition table: Licence Ouverte / Etalab 2.0, © Anses
  (<https://ciqual.anses.fr>, dataset doi:10.57745/RDMHWY). Imported by an administrator; older versions are kept.
- **Nutri-Score** is a trademark of Santé publique France. Grades that do not come from Open Food Facts are estimated
  by MyBody365 with the 2023 algorithm for general foods.

## Photos of the community recipes: Wikimedia Commons

Since 1.11, the community recipes have photos chosen on [Wikimedia Commons](https://commons.wikimedia.org), each under
a free licence (CC0, public domain, CC BY or CC BY-SA). The repository holds no picture: the list of photos, with the
author, the licence and the page of each one, is `backend/src/main/resources/community/images.tsv`, and the server
downloads each photo once. In the app, every photo shows its author and its licence, with a link to its page on
Wikimedia Commons; a copy of a recipe keeps that credit, and so does a backup.
