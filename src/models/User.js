import Sequelize, { Model } from "sequelize";
import bcrypt from "bcryptjs";

class User extends Model {
  static init(sequelize) {
    super.init(
      {
        name: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        email: {
          type: Sequelize.STRING,
          allowNull: false,
          unique: true,
        },
        password: Sequelize.VIRTUAL,
        password_hash: {
          type: Sequelize.STRING,
        },
        default_currency: {
          type: Sequelize.STRING(10),
          defaultValue: "USD",
        },
      },
      {
        sequelize,
        timestamps: true,
      }
    );

    this.addHook("beforeSave", async (user) => {
      if (user.password) {
        user.password_hash = await bcrypt.hash(user.password, 8);
      }
    });

    return this;
  }

  static associate(models) {
    this.hasMany(models.Expense, { foreignKey: "paid_by", as: "expensesPaid" });
    this.hasMany(models.ExpenseParticipant, { foreignKey: "user_id", as: "participations" });
  }

  checkPassword(password) {
    return bcrypt.compare(password, this.password_hash);
  }
}

export default User;
