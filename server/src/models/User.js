import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["admin", "staff"], default: "staff" },
    isActive: { type: Boolean, default: true },

    resetPasswordToken: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },
    resetPasswordRequestedAt: { type: Date, select: false }, // limits reset emails per account

    // Logins issued before this are rejected (middleware/auth.js), so changing or resetting the
    // password logs the account out everywhere else.
    passwordChangedAt: { type: Date },

    // The one login that's currently allowed (utils/generateToken.js startSession).
    sessionId: { type: String },

    // Wrong-password pause on login (see authController.login).
    loginFailures: { type: Number, default: 0, select: false },
    loginLockedUntil: { type: Date, select: false },

    // Reports PIN (see controllers/reportsPinController.js): asked every time Reports is opened.
    // Stored hashed, and never loaded unless asked for.
    reportsPinHash: { type: String, select: false },
    reportsPinChangedAt: { type: Date, select: false }, // passes issued before this stop working
    reportsPinFailures: { type: Number, default: 0, select: false },
    reportsPinLockedUntil: { type: Date, select: false },
  },
  {
    timestamps: true,
    // Never send the session id back to the app (it's only for checking tokens).
    toJSON: {
      transform(doc, ret) {
        delete ret.sessionId;
        return ret;
      },
    },
  }
);

userSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  // 1s back, so a login made right after the change (same second in the token's timestamp) still works.
  if (!this.isNew) this.passwordChangedAt = new Date(Date.now() - 1000);
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model("User", userSchema);
