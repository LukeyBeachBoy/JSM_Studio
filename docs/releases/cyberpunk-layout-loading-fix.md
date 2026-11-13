# Cyberpunk controller layout loading

The profile library cached every opened editor as a draft, including unchanged
files. Reopening an externally updated file could therefore restore the cached
copy instead of the freshly read controller bindings and layers.

Only unsaved edits are now retained as drafts. Saved baselines are tracked through
save, rename and deletion so clean profiles read their current file on reopening.
Intentional unsaved drafts and explicit discard behavior are preserved.

Validation on 27 October 2026: the full-app regression opens an older Cyberpunk
profile, switches away, supplies updated Azeron data and verifies Dodge, Driving
and Weapons on reopening. It also checks that unsaved drafts survive and discarded
drafts do not return. The existing usability/draft-discard regression and frontend
typecheck/build pass. The desktop release build passes with an existing unused
function warning. The corrected local executable was installed with an executable
backup under build-jsm-sdl/layout-loading-backup.

Installed-app verification selected the physical Cyborg, checked Default bindings,
Driving's W output and Weapons' 1 output, then returned to Default. The mapper was
running. The Cyberpunk source profile's SHA256 remained
3BE089CE2409BE1B76EEEDB9619A1882A81635C697E23A8AB57085C1989F6D25.
The temporary localhost debugging listener was removed by a normal restart.
This verifies loading and editor display; gameplay was not exercised.
