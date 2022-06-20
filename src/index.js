const { ApolloServer, gql } = require('apollo-server');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
dotenv.config();

const { DB_URI, DB_NAME, JWT_SECRET } = process.env;

const getToken = (user) => jwt.sign({id: user._id}, JWT_SECRET, {expiresIn: '7 days'});
const getUserFromToken = async (token, db) => {
    if (!token) {
        return null;
    }
    const tokenData = jwt.verify(token, JWT_SECRET);
    if (!tokenData?.id) {
        return null;
    }
    const user = await db.collection('Users').findOne({_id: ObjectId(tokenData.id)});
    return user;
}

/*const books = [
    {
        title: 'The Awakening',
        author: 'Kate Chopins',
    },
    {
        title: 'City of Glass',
        author: 'Paul Auster',
    },
];*/

// A schema is a collection of type definitions (hence "typeDefs")
// that together define the "shape" of queries that are executed against
// your data.
const typeDefs = gql`

    type Query {
        myTaskLists: [TaskList!]!
        getTaskList(id: ID!): TaskList
        getCourses: [Course]!
        getCoursesByCode(courseCode: String!): [Course]!
        getCoursesByDivisionCodes(divisionCodes: [String!]): [Course]!
    }
    
    type Mutation {
        signUp(input: SignUpInput!): AuthUser!
        signIn(input: SignInInput!): AuthUser!
        
        createTaskList(title: String!): TaskList!
        updateTaskList(id: ID!, title: String!): TaskList!
        deleteTaskList(id: ID!): Boolean
        addUserToTaskList(taskListId: ID!, userId: ID!): TaskList!
        
        createToDo(content: String!, taskListId: ID!): ToDo!
        updateToDo(id: ID!, content: String, isCompleted: Boolean): ToDo!
        deleteToDo(id: ID!): Boolean
    }
    
    input SignUpInput {
        email: String! 
        password: String! 
        name: String!
        avatar: String
    }
    
    input SignInInput {
        email: String! 
        password: String! 
    }
    
    type Course {
        id: ID!
        divisionCode: String!
        courseCode: String!
        courseTitle: String!
        credits: Float!
        creditTypeCode: String!
    }
    
    type AuthUser {
        user: User!
        token: String!
    }
    
    type User {
        id: ID!
        name: String!
        email: String!
        avatar: String
    }
  
    type TaskList {
        id: ID!
        createdAt: String!
        title: String!
        progress: Float!
    
        users: [User!]!
        todos: [ToDo!]!
    }
  
    type ToDo {
        id: ID!
        content: String!
        isCompleted: Boolean!
    
        taskList: TaskList!
    }
  
  # Comments in GraphQL strings (such as this one) start with the hash (#) symbol.

  # The "Query" type is special: it lists all of the available queries that
  # clients can execute, along with the return type for each. In this
  # case, the "books" query returns an array of zero or more Books (defined above).
  # type Query {
  #   books: [Book]
  # }
  
  # This "Book" type defines the queryable fields for every book in our data source.
  # type Book {
  #  title: String
  #  author: String
  #}
`;

// Resolvers define the technique for fetching the types defined in the
// schema. This resolver retrieves books from the "books" array above.
const resolvers = {
    // Query: {
    //     books: () => {
    //         return books;
    //     },
    // },
    Query: {
        myTaskLists: async (_, __, {db, user}) => {
            if (!user) {
                throw new Error('Authentication Error. Please sign in.');
            }

            const taskLists = await db.collection('TaskList').find({userIds: user._id}).toArray();
            return taskLists;
        },

        getTaskList: async (_, {id}, {db, user}) => {
            if (!user) {
                throw new Error('Authentication Error. Please sign in.');
            }

            const taskList = await db.collection('TaskList').findOne({"_id" :ObjectId(id)});
            return taskList;
        },

        getCourses: async (_, __, {db}) => {
            const courses = await db.collection('Courses').find().toArray();
            return courses;
        },

        getCoursesByCode: async (_, {courseCode}, {db}) => {
            const code = courseCode.toUpperCase();
            //console.log('/^' + code + '/');
            //const courses = await db.collection('Courses').find({"courseCode" : {$regex: '/^' + code + '/'}}).toArray();
            const courses = await db.collection('Courses').find({courseCode : new RegExp(code)}).toArray();
            return courses;
        },

        getCoursesByDivisionCodes: async (_, {divisionCodes}, {db}) => {
            const courses = await db.collection('Courses').find({ divisionCode: { $in: divisionCodes } }).toArray();
            return courses;
        },
    },
    Mutation: {
        signUp: async (_, {input}, {db}) => {
            const hashedPassword = bcrypt.hashSync(input.password);
            const newUser = {
                ...input,
                password: hashedPassword,
            }
            // save to database
            const result = await db.collection('Users').insertOne(newUser);
            // console.log(result.insertedId);
            // get saved user
            const user = await db.collection('Users').findOne({"_id" :result.insertedId});
            // console.log(user);
            return {
                user: user,
                token: getToken(user),
            }
        },

        signIn: async (_, {input}, {db}) => {
            const signInUser = await db.collection('Users').findOne({email: input.email});
            // console.log(user);
            if (!signInUser) {
                throw new Error('Invalid credentials!');
            }

            // check if password is correct
            const isPasswordCorrect = bcrypt.compareSync(input.password, signInUser.password);
            if (!isPasswordCorrect) {
                throw new Error('Invalid credentials!');
            }

            return {
                user: signInUser,
                token: getToken(signInUser),
            }
        },

        createTaskList: async (_, {title}, {db, user}) => {
            if (!user) {
                throw new Error('Authentication Error. Please sign in.');
            }

            const newTaskList = {
                title,
                createdAt: new Date().toISOString(),
                userIds: [user._id]
            }

            const result = await db.collection('TaskList').insertOne(newTaskList);
            const taskList = await db.collection('TaskList').findOne({"_id" :result.insertedId});
            return taskList;
        },

        updateTaskList: async (_, {id, title}, {db, user}) => {
            if (!user) {
                throw new Error('Authentication Error. Please sign in.');
            }

            const result = await db.collection('TaskList').updateOne({
                _id: ObjectId(id)
            },{
                $set: {
                    title: title
                }
            });
            const taskList = await db.collection('TaskList').findOne({"_id" :ObjectId(id)});
            return taskList;
        },

        deleteTaskList: async (_, {id}, {db, user}) => {
            if (!user) {
                throw new Error('Authentication Error. Please sign in.');
            }

            await db.collection('TaskList').remove({"_id" :ObjectId(id)});
            return true;
        },

        addUserToTaskList: async (_, {taskListId, userId}, {db, user}) => {
            if (!user) {
                throw new Error('Authentication Error. Please sign in.');
            }

            const taskList = await db.collection('TaskList').findOne({"_id" :ObjectId(taskListId)});
            if (!taskList) {
                return null;
            }
            if (taskList.userIds.find((dbId) => dbId.toString() === userId.toString())){
                return taskList;
            }

            await db.collection('TaskList').updateOne({
                _id: ObjectId(taskListId)
            },{
                $push: {
                    userIds: ObjectId(userId)
                }
            });
            taskList.userIds.push(ObjectId(userId));
            //const updatedTaskList = await db.collection('TaskList').findOne({"_id" :ObjectId(taskListId)});
            return taskList;
        },
        createToDo: async(_, {content, taskListId}, {db, user}) => {
            if (!user) {
                throw new Error('Authentication Error. Please sign in.');
            }

            const newToDo = {
                content,
                taskListId: ObjectId(taskListId),
                isCompleted: false
            }

            const result = await db.collection('ToDo').insertOne(newToDo);
            const toDo = await db.collection('ToDo').findOne({"_id" :result.insertedId});
            return toDo;
        },

        updateToDo: async (_, data, {db, user}) => {
            if (!user) {
                throw new Error('Authentication Error. Please sign in.');
            }

            const result = await db.collection('ToDo').updateOne({
                _id: ObjectId(data.id)
            },{
                $set: data
            });
            const toDo = await db.collection('ToDo').findOne({"_id" :ObjectId(data.id)});
            return toDo;
        },

        deleteToDo: async (_, {id}, {db, user}) => {
            if (!user) {
                throw new Error('Authentication Error. Please sign in.');
            }

            await db.collection('ToDo').remove({"_id" :ObjectId(id)});
            return true;
        },
    },
    User: {
        id: (root) => {
            // console.log(root);
            return root._id;
        }
    },
    TaskList: {
        id: (root) => {
            // console.log(root);
            return root._id;
        },
        progress: async ({_id}, _, {db}) => {
            const todos = await db.collection('ToDo').find({taskListId: ObjectId(_id)}).toArray();
            const completed = todos.filter(todo => todo.isCompleted);
            if (todos.length === 0){
                return 0;
            }
            return 100 * completed.length / todos.length;
        },
        users: async ({userIds}, _, {db}) => Promise.all(
            userIds.map((userId) => (
                db.collection('Users').findOne({_id: userId}))
            )
        ),
        todos: async ({_id}, _, {db}) => (
            await db.collection('ToDo').find({taskListId: ObjectId(_id)}).toArray()
        ),
    },
    ToDo: {
        id: (root) => {
            // console.log(root);
            return root._id;
        },
        taskList: async ({taskListId}, _, {db}) => (
            await db.collection('TaskList').findOne({"_id": ObjectId(taskListId)})
        )
    },
    Course: {
        id: (root) => {
            // console.log(root);
            return root._id;
        }
    },
};

const start = async () => {
    const client = new MongoClient(DB_URI, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
    await client.connect();
    const db = client.db(DB_NAME);

    /*const context = {
        db,
    }*/

    // The ApolloServer constructor requires two parameters: your schema
    // definition and your set of resolvers.
    const server = new ApolloServer({
        typeDefs,
        resolvers,
        context: async ({req}) => {
            // console.log(req.headers.authorization);
            const user = await getUserFromToken(req.headers.authorization, db);
            // console.log(user);
            return {
                db,
                user,
            }
        },
    });

    // The `listen` method launches a web server.
    server.listen().then(({ url }) => {
        console.log(`🚀  Server ready at ${url}`);
    });
}

start();
