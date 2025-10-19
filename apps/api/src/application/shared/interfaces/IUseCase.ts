/**
 * Use Case Interface
 *
 * All use cases implement this interface for consistency
 */
export interface IUseCase<TRequest, TResponse> {
  execute(request: TRequest): Promise<TResponse>;
}
