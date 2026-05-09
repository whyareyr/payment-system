import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { config } from "../config.js";
import { HttpError } from "../middleware/error.js";
import { createUserWalletAccount } from "./account.service.js";

export const signupSchema = z.object({
  email: z.email(),
  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters long" })
    .regex(/[a-z]/, {
      message: "Password must contain at least one lowercase letter",
    })
    .regex(/[A-Z]/, {
      message: "Password must contain at least one uppercase letter",
    })
    .regex(/[0-9]/, { message: "Password must contain at least one number" }),
});

export const loginSchema = signupSchema;

type SignupInput = z.infer<typeof signupSchema>;

function signToken(user: { id: string; email: string }) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
    },
    config.jwtSecret,
    {
      expiresIn: "7d",
    }
  );
}

export async function signup(input: SignupInput) {
  const passwordHash = await bcrypt.hash(input.password, 10);

  const user = await prisma.$transaction(
    async (tx: {
      user: {
        create: (arg0: {
          data: { email: string; passwordHash: string };
        }) => any;
      };
    }) => {
      const createdUser = await tx.user.create({
        data: {
          email: input.email.toLowerCase(),
          passwordHash,
        },
      });

      await createUserWalletAccount(tx, createdUser.id);

      return createdUser;
    }
  );

  return {
    user: {
      id: user.id,
      email: user.email,
    },
    token: signToken(user),
  };
}

export async function login(input: SignupInput) {
  const user = await prisma.user.findUnique({
    where: {
      email: input.email.toLowerCase(),
    },
  });

  if (!user) {
    throw new HttpError(401, "Invalid email or password");
  }

  const validPassword = await bcrypt.compare(input.password, user.passwordHash);

  if (!validPassword) {
    throw new HttpError(401, "Invalid email or password");
  }

  return {
    user: {
      id: user.id,
      email: user.email,
    },
    token: signToken(user),
  };
}
