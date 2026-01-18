# API Profiling Report

Input: `profiling/requests.jsonl`

Total samples: 600

## Pipeline: health

Runs: 50

Duration (ms): mean 1.15 | p50 0.89 | p90 1.81 | p99 4.77 | min 0.69 | max 4.77

| Stage       | Count | Mean | p50  | p90  | p99  | Min  | Max  | CV   | Heat |
| ----------- | ----- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- |
| pre_handler | 50    | 0.43 | 0.34 | 0.66 | 1.17 | 0.26 | 1.17 | 0.44 | +    |

## Pipeline: GET /api/health/db

Runs: 50

Duration (ms): mean 1.94 | p50 1.81 | p90 2.10 | p99 6.30 | min 1.53 | max 6.30

| Stage | Count | Mean | p50 | p90 | p99 | Min | Max | CV  | Heat |
| ----- | ----- | ---- | --- | --- | --- | --- | --- | --- | ---- |

## Pipeline: GET /api/pericope/random

Runs: 11

Duration (ms): mean 1.77 | p50 1.66 | p90 2.47 | p99 2.55 | min 1.14 | max 2.55

| Stage | Count | Mean | p50 | p90 | p99 | Min | Max | CV  | Heat |
| ----- | ----- | ---- | --- | --- | --- | --- | --- | --- | ---- |

## Pipeline: pericope_random

Runs: 39

Duration (ms): mean 793.13 | p50 769.33 | p90 876.28 | p99 2113.96 | min 627.32 | max 2113.96

| Stage                    | Count | Mean   | p50    | p90    | p99     | Min    | Max     | CV   | Heat |
| ------------------------ | ----- | ------ | ------ | ------ | ------- | ------ | ------- | ---- | ---- |
| pre_handler              | 39    | 1.08   | 1.00   | 1.44   | 2.36    | 0.74   | 2.36    | 0.25 | +    |
| pericope.random.count    | 39    | 216.13 | 169.03 | 291.21 | 1203.70 | 128.92 | 1203.70 | 0.80 | #    |
| pericope.random.select   | 39    | 156.96 | 141.84 | 215.05 | 329.18  | 105.97 | 329.18  | 0.26 | +    |
| pericope.getPericopeById | 39    | 417.43 | 413.99 | 465.63 | 587.77  | 342.73 | 587.77  | 0.12 | :    |

## Pipeline: verse_get

Runs: 50

Duration (ms): mean 5.21 | p50 2.35 | p90 3.47 | p99 137.39 | min 1.83 | max 137.39

| Stage          | Count | Mean | p50  | p90  | p99    | Min  | Max    | CV   | Heat |
| -------------- | ----- | ---- | ---- | ---- | ------ | ---- | ------ | ---- | ---- |
| pre_handler    | 50    | 1.39 | 1.29 | 1.67 | 2.94   | 1.02 | 2.94   | 0.26 | +    |
| verse.getVerse | 50    | 2.72 | 0.02 | 0.04 | 133.34 | 0.02 | 133.34 | 6.86 | !    |

## Pipeline: verse_cross_refs

Runs: 50

Duration (ms): mean 14.77 | p50 3.31 | p90 4.41 | p99 568.93 | min 2.04 | max 568.93

| Stage                    | Count | Mean  | p50  | p90  | p99    | Min  | Max    | CV   | Heat |
| ------------------------ | ----- | ----- | ---- | ---- | ------ | ---- | ------ | ---- | ---- |
| pre_handler              | 50    | 1.27  | 1.19 | 1.51 | 2.24   | 0.82 | 2.24   | 0.20 | :    |
| verse.getCrossReferences | 50    | 11.01 | 0.04 | 0.07 | 548.31 | 0.03 | 548.31 | 6.97 | !    |

## Pipeline: synopsis

Runs: 50

Duration (ms): mean 947.07 | p50 834.35 | p90 1473.47 | p99 2072.70 | min 606.17 | max 2072.70

| Stage                | Count | Mean   | p50    | p90     | p99     | Min    | Max     | CV   | Heat |
| -------------------- | ----- | ------ | ------ | ------- | ------- | ------ | ------- | ---- | ---- |
| pre_handler          | 50    | 1.58   | 1.45   | 2.07    | 2.78    | 0.98   | 2.78    | 0.25 | +    |
| synopsis.zod_parse   | 50    | 0.24   | 0.10   | 0.47    | 3.82    | 0.07   | 3.82    | 2.22 | !    |
| llm.responses_create | 50    | 942.08 | 830.81 | 1467.84 | 2068.91 | 601.90 | 2068.91 | 0.34 | +    |
| synopsis.runModel    | 50    | 942.92 | 831.29 | 1468.76 | 2069.49 | 602.34 | 2069.49 | 0.34 | +    |

## Pipeline: semantic_connection_synopsis

Runs: 50

Duration (ms): mean 1296.73 | p50 952.81 | p90 1757.48 | p99 5613.91 | min 790.87 | max 5613.91

| Stage                            | Count | Mean    | p50    | p90     | p99     | Min    | Max     | CV   | Heat |
| -------------------------------- | ----- | ------- | ------ | ------- | ------- | ------ | ------- | ---- | ---- |
| pre_handler                      | 50    | 1.41    | 1.27   | 1.96    | 2.62    | 1.10   | 2.62    | 0.24 | :    |
| semantic_connection.fetch_verses | 50    | 236.26  | 189.47 | 289.36  | 931.89  | 124.26 | 931.89  | 0.64 | #    |
| llm.responses_create             | 50    | 1055.26 | 739.04 | 1035.88 | 5370.56 | 599.26 | 5370.56 | 0.95 | #    |
| semantic_connection.runModel     | 50    | 1055.77 | 739.47 | 1036.52 | 5371.54 | 599.79 | 5371.54 | 0.95 | #    |

## Pipeline: discover_connections

Runs: 50

Duration (ms): mean 78.81 | p50 6.62 | p90 8.07 | p99 3605.29 | min 4.74 | max 3605.29

| Stage                             | Count | Mean    | p50     | p90     | p99     | Min     | Max     | CV   | Heat |
| --------------------------------- | ----- | ------- | ------- | ------- | ------- | ------- | ------- | ---- | ---- |
| pre_handler                       | 50    | 1.67    | 1.54    | 2.21    | 3.28    | 1.16    | 3.28    | 0.24 | :    |
| discover_connections.fetch_verses | 1     | 175.91  | 175.91  | 175.91  | 175.91  | 175.91  | 175.91  | 0.00 | .    |
| llm.responses_create              | 1     | 3166.56 | 3166.56 | 3166.56 | 3166.56 | 3166.56 | 3166.56 | 0.00 | .    |
| discover_connections.llm_discover | 1     | 3172.97 | 3172.97 | 3172.97 | 3172.97 | 3172.97 | 3172.97 | 0.00 | .    |
| discover_connections.persist      | 1     | 249.67  | 249.67  | 249.67  | 249.67  | 249.67  | 249.67  | 0.00 | .    |
| discover_connections.cache_hit    | 49    | 0.00    | 0.00    | 0.00    | 0.00    | 0.00    | 0.00    | 0.00 | .    |

## Pipeline: trace

Runs: 50

Duration (ms): mean 13043.52 | p50 12815.21 | p90 14154.89 | p99 17107.84 | min 11375.62 | max 17107.84

| Stage                            | Count | Mean    | p50     | p90     | p99     | Min     | Max     | CV   | Heat |
| -------------------------------- | ----- | ------- | ------- | ------- | ------- | ------- | ------- | ---- | ---- |
| pre_handler                      | 50    | 2.43    | 2.31    | 3.09    | 4.27    | 1.72    | 4.27    | 0.21 | :    |
| anchor.resolve.getVerseId        | 50    | 206.11  | 178.02  | 275.60  | 456.58  | 136.59  | 456.58  | 0.29 | +    |
| trace.resolveMultipleAnchors     | 50    | 206.65  | 178.42  | 276.24  | 458.44  | 138.14  | 458.44  | 0.29 | +    |
| trace.buildVisualBundle          | 50    | 4013.19 | 3925.10 | 4404.77 | 6365.59 | 3374.94 | 6365.59 | 0.12 | :    |
| rank_similarity.embedding_query  | 50    | 278.85  | 229.98  | 434.68  | 641.14  | 146.92  | 641.14  | 0.45 | +    |
| rank_similarity.fetch_embeddings | 50    | 315.76  | 283.38  | 343.19  | 1864.18 | 222.64  | 1864.18 | 0.71 | #    |
| rank_similarity.compute          | 50    | 0.33    | 0.32    | 0.42    | 0.50    | 0.24    | 0.50    | 0.22 | :    |
| rank_similarity.sort             | 50    | 0.07    | 0.06    | 0.12    | 0.16    | 0.03    | 0.16    | 0.50 | #    |
| trace.rankVersesBySimilarity     | 50    | 619.03  | 533.20  | 769.35  | 2143.26 | 391.22  | 2143.26 | 0.42 | +    |
| dedupe.fetch_embeddings          | 50    | 302.55  | 290.56  | 336.18  | 641.02  | 244.44  | 641.02  | 0.19 | :    |
| dedupe.compare_pairs             | 50    | 11.58   | 10.60   | 13.94   | 20.04   | 9.97    | 20.04   | 0.17 | :    |
| trace.deduplicateVerses          | 50    | 336.28  | 326.32  | 372.06  | 677.49  | 274.81  | 677.49  | 0.18 | :    |
| trace.buildPericopeBundle        | 50    | 7662.12 | 7506.88 | 8502.38 | 9517.18 | 6700.72 | 9517.18 | 0.08 | .    |

## Pipeline: root_translation

Runs: 50

Duration (ms): mean 2800.08 | p50 2192.25 | p90 3320.38 | p99 20044.19 | min 1533.99 | max 20044.19

| Stage                                | Count | Mean    | p50     | p90     | p99      | Min     | Max      | CV   | Heat |
| ------------------------------------ | ----- | ------- | ------- | ------- | -------- | ------- | -------- | ---- | ---- |
| pre_handler                          | 50    | 1.67    | 1.56    | 2.10    | 3.43     | 0.80    | 3.43     | 0.29 | +    |
| root_translation.zod_parse           | 50    | 0.13    | 0.10    | 0.18    | 0.83     | 0.05    | 0.83     | 0.84 | #    |
| root_translation.loadLexicon         | 50    | 2.96    | 0.02    | 0.02    | 147.24   | 0.01    | 147.24   | 6.96 | !    |
| root_translation.findStrongsDataPath | 50    | 0.01    | 0.00    | 0.01    | 0.12     | 0.00    | 0.12     | 2.19 | !    |
| root_translation.readBookFile        | 50    | 8.36    | 8.10    | 9.13    | 21.04    | 3.84    | 21.04    | 0.25 | :    |
| root_translation.direct_lookup       | 50    | 14.14   | 13.81   | 15.85   | 26.80    | 6.82    | 26.80    | 0.17 | :    |
| llm.responses_create                 | 49    | 2423.75 | 2169.43 | 3299.41 | 7263.51  | 1515.29 | 7263.51  | 0.46 | +    |
| root_translation.runModel            | 50    | 2775.98 | 2170.17 | 3301.62 | 20003.26 | 1515.78 | 20003.26 | 0.97 | #    |

## Pipeline: chat

Runs: 50

Duration (ms): mean 5237.64 | p50 4850.10 | p90 6892.81 | p99 10970.17 | min 2524.57 | max 10970.17

| Stage                    | Count | Mean    | p50     | p90     | p99      | Min     | Max      | CV   | Heat |
| ------------------------ | ----- | ------- | ------- | ------- | -------- | ------- | -------- | ---- | ---- |
| pre_handler              | 50    | 1.49    | 1.43    | 1.70    | 2.60     | 1.07    | 2.60     | 0.18 | :    |
| chat.zod_parse           | 50    | 0.14    | 0.10    | 0.17    | 1.36     | 0.06    | 1.36     | 1.29 | !    |
| chat.selectRelevantTools | 50    | 0.58    | 0.39    | 1.11    | 2.51     | 0.28    | 2.51     | 0.85 | #    |
| llm.responses_create     | 50    | 5232.44 | 4845.31 | 6888.50 | 10964.82 | 2521.42 | 10964.82 | 0.29 | +    |
| chat.runModel            | 50    | 5232.95 | 4845.76 | 6888.95 | 10965.52 | 2521.84 | 10965.52 | 0.29 | +    |

## Pipeline: chat_stream

Runs: 50

Duration (ms): mean 17397.83 | p50 16528.03 | p90 21196.19 | p99 24325.84 | min 14957.16 | max 24325.84

| Stage                            | Count | Mean     | p50      | p90      | p99      | Min      | Max      | CV   | Heat |
| -------------------------------- | ----- | -------- | -------- | -------- | -------- | -------- | -------- | ---- | ---- |
| pre_handler                      | 50    | 2.59     | 2.20     | 3.38     | 10.76    | 1.54     | 10.76    | 0.50 | #    |
| chat_stream.zod_parse            | 50    | 0.20     | 0.19     | 0.28     | 0.50     | 0.13     | 0.50     | 0.34 | +    |
| pericope.resolve.search          | 50    | 683.20   | 586.03   | 907.44   | 2463.14  | 417.34   | 2463.14  | 0.49 | +    |
| exegesis.resolvePericopeFirst    | 50    | 683.25   | 586.13   | 907.48   | 2463.51  | 417.38   | 2463.51  | 0.49 | +    |
| anchor.resolve.getVerseId        | 50    | 155.83   | 146.29   | 192.56   | 307.18   | 118.67   | 307.18   | 0.23 | :    |
| exegesis.resolveMultipleAnchors  | 50    | 178.17   | 149.09   | 198.97   | 1221.25  | 119.01   | 1221.25  | 0.86 | #    |
| exegesis.buildVisualBundle       | 49    | 4006.30  | 3864.61  | 4369.81  | 6642.91  | 3167.14  | 6642.91  | 0.16 | :    |
| rank_similarity.embedding_query  | 50    | 233.46   | 203.04   | 359.12   | 543.85   | 142.22   | 543.85   | 0.37 | +    |
| rank_similarity.fetch_embeddings | 50    | 281.58   | 273.94   | 334.71   | 419.07   | 155.91   | 419.07   | 0.16 | :    |
| rank_similarity.compute          | 50    | 0.37     | 0.34     | 0.48     | 1.06     | 0.08     | 1.06     | 0.41 | +    |
| rank_similarity.sort             | 50    | 0.14     | 0.07     | 0.17     | 2.89     | 0.03     | 2.89     | 2.77 | !    |
| exegesis.rankVersesBySimilarity  | 50    | 539.77   | 520.54   | 687.41   | 884.38   | 342.81   | 884.38   | 0.21 | :    |
| dedupe.fetch_embeddings          | 50    | 298.47   | 284.43   | 356.57   | 479.73   | 161.40   | 479.73   | 0.18 | :    |
| dedupe.compare_pairs             | 50    | 13.41    | 12.87    | 19.37    | 21.32    | 0.97     | 21.32    | 0.30 | +    |
| exegesis.deduplicateVerses       | 50    | 335.08   | 322.42   | 399.58   | 517.19   | 166.87   | 517.19   | 0.17 | :    |
| exegesis.getPericopeById         | 50    | 583.94   | 565.48   | 678.96   | 814.72   | 487.48   | 814.72   | 0.12 | :    |
| exegesis.buildPericopeBundle     | 50    | 7882.53  | 7754.71  | 8864.00  | 10811.61 | 6643.90  | 10811.61 | 0.10 | .    |
| llm.stream_create                | 50    | 387.87   | 302.49   | 431.58   | 2623.52  | 219.56   | 2623.52  | 0.92 | #    |
| llm.stream_ttft                  | 50    | 786.93   | 688.74   | 938.86   | 3156.84  | 464.26   | 3156.84  | 0.53 | #    |
| llm.stream_total                 | 50    | 3032.67  | 2600.57  | 3495.31  | 10060.14 | 1898.51  | 10060.14 | 0.48 | +    |
| exegesis.runModelStream          | 50    | 3036.37  | 2604.41  | 3499.19  | 10063.36 | 1901.52  | 10063.36 | 0.48 | +    |
| chat_stream.kernel_pipeline      | 50    | 17393.58 | 16524.48 | 21191.49 | 24320.95 | 14954.34 | 24320.95 | 0.13 | :    |
| anchor.resolve.semantic_multi    | 1     | 1091.32  | 1091.32  | 1091.32  | 1091.32  | 1091.32  | 1091.32  | 0.00 | .    |
| multi_anchor.buildVisualBundle   | 3     | 3426.01  | 3500.77  | 3830.74  | 3830.74  | 2946.50  | 3830.74  | 0.11 | :    |
| exegesis.buildMultiAnchorTree    | 1     | 10287.63 | 10287.63 | 10287.63 | 10287.63 | 10287.63 | 10287.63 | 0.00 | .    |

## Variance Heatmap (Stage CV)

Legend: . (low) : (moderate) + (high) # (very high) ! (extreme)

- health
  - pre_handler (cv 0.44)
- GET /api/health/db
- GET /api/pericope/random
- pericope_random
  - pre_handler (cv 0.25)
  # pericope.random.count (cv 0.80)
  - pericope.random.select (cv 0.26)
    : pericope.getPericopeById (cv 0.12)
- verse_get
  - pre_handler (cv 0.26)
    ! verse.getVerse (cv 6.86)
- verse_cross_refs
  : pre_handler (cv 0.20)
  ! verse.getCrossReferences (cv 6.97)
- synopsis
  - pre_handler (cv 0.25)
    ! synopsis.zod_parse (cv 2.22)
  - llm.responses_create (cv 0.34)
  - synopsis.runModel (cv 0.34)
- semantic_connection_synopsis
  : pre_handler (cv 0.24)
  # semantic_connection.fetch_verses (cv 0.64)
  # llm.responses_create (cv 0.95)
  # semantic_connection.runModel (cv 0.95)
- discover_connections
  : pre_handler (cv 0.24)
  . discover_connections.fetch_verses (cv 0.00)
  . llm.responses_create (cv 0.00)
  . discover_connections.llm_discover (cv 0.00)
  . discover_connections.persist (cv 0.00)
  . discover_connections.cache_hit (cv 0.00)
- trace
  : pre_handler (cv 0.21)
  - anchor.resolve.getVerseId (cv 0.29)
  - trace.resolveMultipleAnchors (cv 0.29)
    : trace.buildVisualBundle (cv 0.12)
  - rank_similarity.embedding_query (cv 0.45)
  # rank_similarity.fetch_embeddings (cv 0.71)
  : rank_similarity.compute (cv 0.22)
  # rank_similarity.sort (cv 0.50)
  - trace.rankVersesBySimilarity (cv 0.42)
    : dedupe.fetch_embeddings (cv 0.19)
    : dedupe.compare_pairs (cv 0.17)
    : trace.deduplicateVerses (cv 0.18)
    . trace.buildPericopeBundle (cv 0.08)
- root_translation
  - pre_handler (cv 0.29)
  # root_translation.zod_parse (cv 0.84)
  ! root_translation.loadLexicon (cv 6.96)
  ! root_translation.findStrongsDataPath (cv 2.19)
  : root_translation.readBookFile (cv 0.25)
  : root_translation.direct_lookup (cv 0.17)
  - llm.responses_create (cv 0.46)
  # root_translation.runModel (cv 0.97)
- chat
  : pre_handler (cv 0.18)
  ! chat.zod_parse (cv 1.29)
  # chat.selectRelevantTools (cv 0.85)
  - llm.responses_create (cv 0.29)
  - chat.runModel (cv 0.29)
- chat_stream
  # pre_handler (cv 0.50)
  - chat_stream.zod_parse (cv 0.34)
  - pericope.resolve.search (cv 0.49)
  - exegesis.resolvePericopeFirst (cv 0.49)
    : anchor.resolve.getVerseId (cv 0.23)
  # exegesis.resolveMultipleAnchors (cv 0.86)
  : exegesis.buildVisualBundle (cv 0.16)
  - rank_similarity.embedding_query (cv 0.37)
    : rank_similarity.fetch_embeddings (cv 0.16)
  - rank_similarity.compute (cv 0.41)
    ! rank_similarity.sort (cv 2.77)
    : exegesis.rankVersesBySimilarity (cv 0.21)
    : dedupe.fetch_embeddings (cv 0.18)
  - dedupe.compare_pairs (cv 0.30)
    : exegesis.deduplicateVerses (cv 0.17)
    : exegesis.getPericopeById (cv 0.12)
    . exegesis.buildPericopeBundle (cv 0.10)
  # llm.stream_create (cv 0.92)
  # llm.stream_ttft (cv 0.53)
  - llm.stream_total (cv 0.48)
  - exegesis.runModelStream (cv 0.48)
    : chat_stream.kernel_pipeline (cv 0.13)
    . anchor.resolve.semantic_multi (cv 0.00)
    : multi_anchor.buildVisualBundle (cv 0.11)
    . exegesis.buildMultiAnchorTree (cv 0.00)

## Top Latency Contributors (by mean stage duration)

| Rank | Pipeline             | Stage                             | Mean     | p90      | p99      | Count |
| ---- | -------------------- | --------------------------------- | -------- | -------- | -------- | ----- |
| 1    | chat_stream          | chat_stream.kernel_pipeline       | 17393.58 | 21191.49 | 24320.95 | 50    |
| 2    | chat_stream          | exegesis.buildMultiAnchorTree     | 10287.63 | 10287.63 | 10287.63 | 1     |
| 3    | chat_stream          | exegesis.buildPericopeBundle      | 7882.53  | 8864.00  | 10811.61 | 50    |
| 4    | trace                | trace.buildPericopeBundle         | 7662.12  | 8502.38  | 9517.18  | 50    |
| 5    | chat                 | chat.runModel                     | 5232.95  | 6888.95  | 10965.52 | 50    |
| 6    | chat                 | llm.responses_create              | 5232.44  | 6888.50  | 10964.82 | 50    |
| 7    | trace                | trace.buildVisualBundle           | 4013.19  | 4404.77  | 6365.59  | 50    |
| 8    | chat_stream          | exegesis.buildVisualBundle        | 4006.30  | 4369.81  | 6642.91  | 49    |
| 9    | chat_stream          | multi_anchor.buildVisualBundle    | 3426.01  | 3830.74  | 3830.74  | 3     |
| 10   | discover_connections | discover_connections.llm_discover | 3172.97  | 3172.97  | 3172.97  | 1     |
| 11   | discover_connections | llm.responses_create              | 3166.56  | 3166.56  | 3166.56  | 1     |
| 12   | chat_stream          | exegesis.runModelStream           | 3036.37  | 3499.19  | 10063.36 | 50    |
| 13   | chat_stream          | llm.stream_total                  | 3032.67  | 3495.31  | 10060.14 | 50    |
| 14   | root_translation     | root_translation.runModel         | 2775.98  | 3301.62  | 20003.26 | 50    |
| 15   | root_translation     | llm.responses_create              | 2423.75  | 3299.41  | 7263.51  | 49    |
