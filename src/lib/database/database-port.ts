import type {
  QueryConfig,
  QueryResult,
  QueryResultRow,
} from "pg";

export interface AnalysisCacheQueryExecutor {
  query<Row extends QueryResultRow = QueryResultRow>(
    config: QueryConfig,
  ): Promise<QueryResult<Row>>;
}

export interface AnalysisCacheTransactionManager
  extends AnalysisCacheQueryExecutor {
  withTransaction<Result>(
    work: (executor: AnalysisCacheQueryExecutor) => Promise<Result>,
  ): Promise<Result>;
}
