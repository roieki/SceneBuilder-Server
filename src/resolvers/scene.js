
const { parse, introspectionQuery, graphqlSync} = require('graphql');
const pluralize = require('pluralize')
const gql = require("graphql-tag");


const ApolloBoost = require('apollo-boost');
const ApolloClient = ApolloBoost.default;


const scene = {
  async hydrateScenes(parent, {uri}, ctx, info){
    console.log("uri", uri)
    const client = new ApolloClient({
      uri
    });
    const query = parse(introspectionQuery, { noLocation: true });    
    
    let introspecteion = await client.query({query})    
    let {types, queryType, mutationType, subscriptionType} = introspecteion.data.__schema
    let objectTypes = types.filter(t => t.kind === 'OBJECT')
    let queryObject = objectTypes.filter(x => x.name === 'Query')
    let queries = queryObject[0].fields.map(x => x.name)

    let pluralQueries = queries.filter(x => { return pluralize.isPlural(x)})

    let scenes = pluralQueries.map(async typeName => {
      let queryTxt = `
        query {
          ${typeName}(first: 1000){
            id
          }
        }
      `

      let query = gql(queryTxt)
      let result = await client.query({query})
      
      let containerNode = {

      }

      let dataOverlays = []

      let name = typeName + "_aggregation"
      let semanticLayoutNodes = [];
      let nodes = [];
    
      let scene 

      console.log("scene", scene)
      let nodeExists = await ctx.db.exists.Scene({name})

      if (!nodeExists){

        if (result.data && result.data[typeName].length > 0) {
          nodes = result.data[typeName].map((x, key) => ({
            name: `${typeName}_${key}`,
            position: {
             id: "cjkj9uu5paw3f0b436aqz9owl"
            }
          }))
        }

        console.log("NODES", nodes)

        let semanticLayoutNodes = nodes.map(async node => {
          return await ctx.db.mutation.createSemanticLayoutNode({data: node})  
          // console.log("node", node)
        })

        // ctx.db.request(query, variable)

        scene = {
          name,
          semanticLayoutNodes,
          dataOverlays
        }

        // await ctx.db.mutation.createScene({data: scene})    
      } else {
        // await ctx.db.mutation.updateScene({where: {name}, data: scene})  
      }          
      
    })

    
    //Create a scene per type
    

    return {
      id: "123"
    }
      
    // let scene = await ctx.db.query.scenes({where: {id: sceneId}}, info)



    // let sceneData = getSceneData()
    // return ctx.db.mutation.updateScene({
    //   where: {id: sceneId },
    //   data: sceneData
    // })

  }
  // async createDraft(parent, { title, text }, ctx, info) {
  //   const userId = getUserId(ctx)
  //   return ctx.db.mutation.createPost(
  //     {
  //       data: {
  //         title,
  //         text,
  //         isPublished: false,
  //         author: {
  //           connect: { id: userId },
  //         },
  //       },
  //     },
  //     info
  //   )
  // },

  // async publish(parent, { id }, ctx, info) {
  //   const userId = getUserId(ctx)
  //   const postExists = await ctx.db.exists.Post({
  //     id,
  //     author: { id: userId },
  //   })
  //   if (!postExists) {
  //     throw new Error(`Post not found or you're not the author`)
  //   }

  //   return ctx.db.mutation.updatePost(
  //     {
  //       where: { id },
  //       data: { isPublished: true },
  //     },
  //     info,
  //   )
  // },

  // async deletePost(parent, { id }, ctx, info) {
  //   const userId = getUserId(ctx)
  //   const postExists = await ctx.db.exists.Post({
  //     id,
  //     author: { id: userId },
  //   })
  //   if (!postExists) {
  //     throw new Error(`Post not found or you're not the author`)
  //   }

  //   return ctx.db.mutation.deletePost({ where: { id } })
  // },
}

module.exports = { scene }
