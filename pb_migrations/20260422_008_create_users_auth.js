/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    name: "users",
    type: "auth",
    authAlert: {
      enabled: true,
      emailTemplate: {
        subject: "Suspicious login attempt",
        body: "<p>Hello,</p>\n<p>We detected a suspicious login attempt on your account.</p>\n<p>If this was you, you may safely ignore this email.</p>\n<p>If this wasn't you, please change your password immediately.</p>",
      },
    },
    oauth2: {
      mappedFields: {
        id: "",
        name: "",
        username: "",
        avatarURL: "",
      },
    },
    passwordAuth: {
      enabled: true,
      identityFields: ["email"],
    },
    mfa: {
      enabled: false,
      duration: 1800,
      rule: "",
    },
    otp: {
      enabled: false,
      duration: 180,
      length: 8,
      emailTemplate: {
        subject: "OTP code",
        body: "",
      },
    },
    authRule: "",
    manageRule: null,
    schema: [
      {
        name: "display_name",
        type: "text",
        required: false,
      },
    ],
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("users");
  return app.delete(collection);
});
