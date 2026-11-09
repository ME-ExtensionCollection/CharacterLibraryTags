# Character Library Tag Filter

A Marinara Engine External Extension that adds tag filtering to the full Character Library (**Open Library**).

A tag button next to the library toolbar expands three fields:

- **Mandatory tags**: shows only characters that have every one of the chosen tags.
- **At least one tag**: shows only characters that have any of the chosen tags.
- **Excluded tags**: hides characters that have any of the chosen tags.

The rows combine: a character is shown when it has all mandatory tags, at least one of the "at least one" tags (if any are set), and none of the excluded tags.

Type in either field to get tag suggestions with character counts. Add a tag by clicking it or pressing Enter, and move through suggestions with the arrow keys. Backspace in an empty field removes the last tag.

<img width="1931" height="380" alt="image" src="https://github.com/user-attachments/assets/d693c5e6-ee00-4e87-978f-c2315791a872" />

<img width="947" height="403" alt="image" src="https://github.com/user-attachments/assets/5d6bebc6-6815-462b-b36b-f0f5d9affc89" />



## How it works

- **Mandatory tags** are written into the library search box as `"Tag"` terms. Marinara treats every search term as a tag the character must have and filters on the server, so this covers characters that aren't loaded yet. Quoting keeps multi-word tags together.
- **Excluded tags** are written into the search box as `-tag:"Tag"`, which is Marinara's own exclusion syntax.
- Both stay in sync with the search box. Typing `"X"` or `-tag:"X"` by hand adds a chip, and deleting the token removes the chip.
- **At least one tag** hides non-matching cards with an injected stylesheet, because Marinara's search has no any-of tag filter. The tag data comes from `GET /api/characters/catalog?view=summary`.
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

- Once a mandatory tag is set, every other word in the search box also counts as a required tag. For example, `alice "elf"` only matches characters tagged both `alice` and `elf`, not characters named Alice. The panel warns when this happens.
- **At least one tag** can only hide cards that are already loaded. Marinara loads the next page on its own while the list is short, and the panel shows how many matching characters exist in total.
- Marinara's own "visible / loaded" count in the library header ignores the **At least one tag** filter.
- Tags that contain `"` can't be made mandatory or excluded, because the search syntax can't quote them.
