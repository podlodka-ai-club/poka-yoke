# Third-party data licenses

SciFact-Memory redistributes a deterministic subset of SciFact and adds task
splits, opaque identifiers, memory episodes, procedural-family metadata, and an
evaluation protocol.

The upstream SciFact license assigns different terms to its components:

- claims and evidence annotations are licensed under
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/);
- abstracts originate from Semantic Scholar's S2ORC dataset and are licensed
  under [ODC-By 1.0](https://opendatacommons.org/licenses/by/1-0/);
- upstream SciFact code is licensed under Apache 2.0, although this release does
  not copy that code.

The authoritative upstream notice is
[`allenai/scifact/LICENSE.md`](https://github.com/allenai/scifact/blob/master/LICENSE.md).
Source document IDs and claim IDs remain available in evaluator-only provenance
so every included record is traceable. See the dataset README for the complete
SciFact citation.

Version 2 additionally includes repository-maintained Russian translations of a
subset of claims and evidence passages. They are derivative annotations provided
under the same attribution chain and must not be represented as native-language
source publications.
