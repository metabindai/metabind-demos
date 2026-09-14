## Android package migration (pending)

This branch targets the planned GitHub Packages cutover. **Do not merge until
BindJS `0.0.31` and Metabind SDK `0.2.10` are published and downloaded successfully
from their source repositories.** These candidate versions are not yet available
there.

| Dependency | New package repository | Candidate version |
| --- | --- | --- |
| `ai.metabind:bindjs-android` | `metabindai/bindjs-android` | `0.0.31` |
| Metabind Android SDK libraries | `metabindai/metabind-android` | `0.2.10` |

Update both the Maven repository configuration and dependency versions. Deleting
historical packages will break fresh builds pinned to those versions, including
transitive dependencies of older SDKs. Already-installed apps keep working.
GitHub Packages still needs `read:packages` authentication for public downloads.
Verify the migration on a fresh CI worker without local source substitution.
