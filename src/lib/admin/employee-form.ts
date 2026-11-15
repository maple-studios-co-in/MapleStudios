export function employeeEditFields(input: Record<string, unknown>) {
  return {
    name: input.name,
    title: input.title,
    contractStart: input.contractStart,
    contractStatus: input.contractStatus,
    contractReference: input.contractReference,
    status: input.status,
  };
}
