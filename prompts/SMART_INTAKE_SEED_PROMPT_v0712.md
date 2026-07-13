# SMART INTAKE COMPATIBILITY SEED

This agent is deterministic and does not call a language model. The prompt file exists so the shared agent loader can initialize the compatibility adapter.

The adapter may preserve these user-provided fields:

- viewer outcome
- target audience
- duration
- platform
- aspect ratio
- audience level
- delivery tone
- production formats

Missing values remain empty. Do not infer defaults or generate narrative structure.
