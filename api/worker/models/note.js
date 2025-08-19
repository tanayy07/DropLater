const mongoose = require('mongoose');

const attemptSchema = new mongoose.Schema(
  {
    at: { type: Date, required: true },
    statusCode: { type: Number, required: true },
    ok: { type: Boolean, required: true },
    error: { type: String }
  },
  { _id: false }
);

const noteSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    body: { type: String, required: true },
    releaseAt: { type: Date, required: true },
    webhookUrl: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'delivered', 'failed', 'dead'],
      default: 'pending',
      index: true
    },
    attempts: { type: [attemptSchema], default: [] },
    deliveredAt: { type: Date, default: null }
  },
  { collection: 'notes', timestamps: true }
);

noteSchema.index({ releaseAt: 1 });

module.exports = mongoose.models.Note || mongoose.model('Note', noteSchema);


