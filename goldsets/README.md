# Goldset Fixtures

This directory keeps small, durable gold-standard JSON files in Git.

Source videos are intentionally not tracked in normal Git because they are large binary fixtures. Keep local copies under each `goldsets/video*/` folder when running local evaluations, or restore them from the original source links referenced in the matching gold-standard docs.

If a video must be versioned later, use Git LFS or external artifact storage rather than normal Git history.
