# Character Library Tag Filter

A Marinara Engine External Extension that adds tag filtering to the full Character Library (**Open Library**).

A tag button next to the library toolbar expands two fields:

- **At least one tag**: shows only characters that have any of the chosen tags.
- **Excluded tags**: hides characters that have any of the chosen tags.

Type in either field to get tag suggestions with character counts. Add a tag by clicking it or pressing Enter, and move through suggestions with the arrow keys. Backspace in an empty field removes the last tag.

## How it works

- **Excluded tags** are written into the library search box as `-tag:"Tag"`, which is Marinara's own exclusion syntax. The two stay in sync: typing `-tag:"X"` into the search box by hand adds a chip, and removing the token removes the chip.
- **At least one tag** hides non-matching cards with an injected stylesheet. The tag data comes from `GET /api/characters/catalog`.
- Filters reset every time the library opens, like Marinara's search box.
- The persona library is left alone.

## Install

The extension needs **Full page access**, because the sandboxed runtime can't reach the library's DOM. Full page code runs inside Marinara's page with the same authority as code pasted into the browser console, so read `extension.js` before you approve it.

1. Set `ENABLE_EXTERNAL_EXTENSIONS=true` in the Marinara host's `.env` and restart Marinara.
2. Open **Settings** > **Advanced** > **Danger Zone** and enable **Allow third-party extension imports**.
3. Open **Settings** > **Addons** > **External Extensions** and choose **Import Extension Folder**. Select this folder.
4. Open the draft, check the code, choose **Review and Run**, and approve the hash.

Every code change disables the extension until you review and approve the new hash.

## Limitations

- The library loads 100 characters per page. **At least one tag** can only show cards that are already loaded. The panel shows how many matching characters exist in total, so use **Load more** to see the rest.
- Marinara's own "visible / loaded" count in the library header ignores the include filter.
- Tags that contain `"` can't be excluded, because the search syntax can't quote them.

## Roadmap

- **Mandatory tags** (must have all).
- Optional checkbox to auto-load every page while a filter is active.
