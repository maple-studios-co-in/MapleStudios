import mongoose, {
  Schema,
  model,
  type InferSchemaType,
  type Model,
} from "mongoose";
const options = {
  timestamps: true,
  toJSON: {
    versionKey: false,
    transform: (_doc: unknown, ret: Record<string, unknown>) => {
      ret.id = String(ret._id);
      delete ret._id;
      return ret;
    },
  },
};
const EmployeeSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    title: { type: String, default: "" },
    contractStart: { type: String, required: true },
    contractStatus: {
      type: String,
      enum: ["draft", "signed"],
      default: "draft",
    },
    contractReference: { type: String, default: "" },
    status: {
      type: String,
      enum: ["onboarding", "active", "inactive"],
      default: "onboarding",
    },
    updatedBy: String,
  },
  options,
);
const AttendanceSchema = new Schema(
  {
    employeeId: { type: String, required: true },
    date: { type: String, required: true },
    status: {
      type: String,
      enum: ["present", "remote", "half-day", "absent", "leave"],
      required: true,
    },
    note: { type: String, default: "" },
    updatedBy: String,
  },
  options,
);
AttendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });
const LeaveSchema = new Schema(
  {
    employeeId: { type: String, required: true },
    start: { type: String, required: true },
    end: { type: String, required: true },
    days: { type: Number, required: true },
    reason: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    requestedBy: String,
    reviewedBy: String,
    reviewedAt: Date,
  },
  options,
);
const PayrollSchema = new Schema(
  {
    employeeId: { type: String, required: true },
    employeeName: { type: String, required: true },
    period: { type: String, required: true },
    currency: { type: String, default: "INR" },
    base: { type: Number, required: true },
    allowances: { type: Number, default: 0 },
    adjustment: { type: Number, default: 0 },
    deductions: { type: Number, default: 0 },
    leaveDeduction: { type: Number, default: 0 },
    net: { type: Number, required: true },
    notes: { type: String, default: "" },
    revision: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["draft", "approved", "paid"],
      default: "draft",
    },
    paymentReference: String,
    history: [{ action: String, actor: String, at: Date }],
  },
  options,
);
PayrollSchema.index({ employeeId: 1, period: 1 }, { unique: true });
type EmployeeData = InferSchemaType<typeof EmployeeSchema>;
export const Employee: Model<EmployeeData> =
  (mongoose.models.Employee as Model<EmployeeData> | undefined) ||
  model("Employee", EmployeeSchema);
type AttendanceData = InferSchemaType<typeof AttendanceSchema>;
export const Attendance: Model<AttendanceData> =
  (mongoose.models.Attendance as Model<AttendanceData> | undefined) ||
  model("Attendance", AttendanceSchema);
type LeaveData = InferSchemaType<typeof LeaveSchema>;
export const Leave: Model<LeaveData> =
  (mongoose.models.Leave as Model<LeaveData> | undefined) ||
  model("Leave", LeaveSchema);
type PayrollData = InferSchemaType<typeof PayrollSchema>;
export const Payroll: Model<PayrollData> =
  (mongoose.models.Payroll as Model<PayrollData> | undefined) ||
  model("Payroll", PayrollSchema);
